import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  MEAL_PLAN_CONFIG,
  estimateTdee,
  medicalGate,
  clampCalorieTarget,
} from "../_shared/mealConfig.ts";
import { resolveEntitlement } from "../_shared/entitlement.ts";
import { chatCompletion, LlmError } from "../_shared/llmProvider.ts";
import {
  parseMealPlanJson,
  resolveAndValidateMealPlan,
  daysOutsideTolerance,
  MealValidationError,
  type DietInfo,
  type NormalizedMealPlan,
} from "../_shared/mealValidation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeDiet(raw: unknown): DietInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = r.status === "provided" ? "provided" : r.status === "skipped" ? "skipped" : null;
  if (!status) return null;
  const strs = (v: unknown, n = 30) =>
    Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, n) : [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 40) : undefined);
  return {
    status,
    pattern: str(r.pattern),
    allergies: strs(r.allergies),
    dislikes: strs(r.dislikes),
    cuisines: strs(r.cuisines),
    budget: str(r.budget),
    cookTime: str(r.cookTime),
    mealsPerDay: Number.isFinite(Number(r.mealsPerDay)) ? Math.min(6, Math.max(1, Math.round(Number(r.mealsPerDay)))) : undefined,
    medicalConditions: strs(r.medicalConditions),
    allergiesConfirmedAt: typeof r.allergiesConfirmedAt === "string" ? r.allergiesConfirmedAt : undefined,
  };
}

function buildSystemPrompt(): string {
  return `You are a registered-dietitian-style meal planner. Generate a day-by-day meal plan.

## RULES
- Return ONLY valid JSON matching the schema. No prose, no markdown fences.
- Propose whole/generic foods and portions ONLY. Do NOT provide calorie or macro numbers — the app computes those from a food database.
- Respect the dietary pattern and the excluded foods strictly.
- Hit the daily calorie target as closely as possible by choosing sensible portions.
- Use common, resolvable food names (e.g. "chicken breast", "brown rice", "olive oil", "greek yogurt").
- Every day should have the requested number of meals; each meal 2–5 foods.

## OUTPUT JSON SCHEMA
{
  "planName": "string",
  "durationDays": ${MEAL_PLAN_CONFIG.DURATION_DAYS},
  "days": [
    { "dayNumber": 1, "meals": [
      { "mealType": "breakfast|lunch|dinner|snack", "name": "string", "foods": [
        { "name": "string", "quantity": 100, "unit": "g|ml|piece|cup|tbsp|tsp|oz", "usdaHint": "optional" }
      ] }
    ] }
  ],
  "notes": "optional string"
}`;
}

function buildUserMessage(targetCalories: number, diet: DietInfo, excluded: string[]): string {
  const allergies = (diet.allergies ?? []).join(", ") || "none";
  const dislikes = [...(diet.dislikes ?? []), ...excluded].join(", ") || "none";
  return `Generate a ${MEAL_PLAN_CONFIG.DURATION_DAYS}-day plan with ${diet.mealsPerDay ?? 3} meals/day.
Daily calorie target: ${targetCalories} kcal (aim within ${Math.round(MEAL_PLAN_CONFIG.TOLERANCE_PCT * 100)}%).
Dietary pattern: ${diet.pattern ?? "omnivore"}
Allergies to AVOID entirely: ${allergies}
Do NOT include (dislikes/excluded): ${dislikes}
Cuisines: ${(diet.cuisines ?? []).join(", ") || "any"}
Budget: ${diet.budget ?? "any"} · Cooking: ${diet.cookTime ?? "any"}`.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await createClient(
      SUPABASE_URL, SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as { diet_info?: unknown };

    // Profile + goal + latest weight
    const [{ data: profile }, { data: goal }, { data: metrics }] = await Promise.all([
      admin.from("user_profiles").select("sex, height_cm, date_of_birth, activity_level, diet_info").eq("id", user.id).single(),
      admin.from("user_goals").select("target_calories, goal_type").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      admin.from("body_metrics").select("weight_kg").eq("user_id", user.id).order("date", { ascending: false }).limit(1),
    ]);
    if (!profile) return json({ error: "Profile not found" }, 404);

    // Diet gate — ask once if never collected; persist an incoming answer.
    let diet: DietInfo | null = (profile.diet_info as DietInfo | null) ?? null;
    const incoming = sanitizeDiet(body.diet_info);
    if (incoming) {
      await admin.from("user_profiles").update({ diet_info: incoming }).eq("id", user.id);
      diet = incoming;
    } else if (diet == null) {
      return json({ code: "DIET_INFO_REQUIRED", error: "Dietary info needed before your first meal plan." }, 428);
    }

    // Medical off-ramp (hard).
    const gate = medicalGate(diet.medicalConditions);
    if (gate.blocked) return json({ code: "MEDICAL_GATE", error: gate.message }, 422);

    // Entitlement (per-feature trial).
    const entitlement = await resolveEntitlement(admin, user.id, "meal");
    if (!entitlement.allowed) {
      return json({ code: "TRIAL_EXPIRED", error: "Your free meal-plan trial has ended. Upgrade to keep generating." }, 402);
    }

    // Daily safety cap (atomic).
    const { data: capAllowed, error: capErr } = await admin.rpc("consume_ai_usage", {
      p_user_id: user.id, p_feature: "generate_meal_plan", p_limit: MEAL_PLAN_CONFIG.DAILY_SAFETY_LIMIT,
    });
    if (!capErr && capAllowed === false) {
      return json({ code: "RATE_LIMITED", error: `Daily generation limit reached (${MEAL_PLAN_CONFIG.DAILY_SAFETY_LIMIT}/day).` }, 429);
    }

    // Derive + clamp the calorie target (server-authoritative).
    const weightKg = Number(metrics?.[0]?.weight_kg) || 0;
    const heightCm = Number(profile.height_cm) || 0;
    const age = profile.date_of_birth
      ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 864e5))
      : null;
    const sex = String(profile.sex ?? "other");
    const baseTarget = Number(goal?.target_calories) || 0;
    if (!baseTarget || !weightKg || !heightCm) {
      return json({ error: "Complete your profile (weight, height, goal) before generating a meal plan." }, 422);
    }
    const tdee = estimateTdee(weightKg, heightCm, String(profile.activity_level ?? "lightly_active"), age ?? 30, sex);
    const bmi = heightCm > 0 ? weightKg / ((heightCm / 100) ** 2) : null;
    const { calories: targetCalories, softened } = clampCalorieTarget({ target: baseTarget, tdee, sex, age, bmi });

    // Generate + resolve + hard-filter + macro-compute (one repair retry).
    const systemPrompt = buildSystemPrompt();
    let result;
    try {
      result = await generateAndValidateMeal(admin, systemPrompt, diet, targetCalories);
    } catch (err) {
      if (err instanceof LlmError) return json({ error: "The AI service is busy. Please try again shortly." }, 503);
      if (err instanceof MealValidationError) return json({ error: "Couldn't build a valid meal plan. Please try again." }, 502);
      throw err;
    }

    if (entitlement.startTrialAfterSuccess) {
      await admin.rpc("start_ai_trial", { p_user_id: user.id, p_feature: "meal" });
    }

    return json({
      plan: result.plan,
      targetCalories,
      softened,
      disclaimer: MEAL_PLAN_CONFIG.DISCLAIMER,
    });
  } catch (err) {
    console.error("[generate-meal-plan]", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

async function generateAndValidateMeal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  systemPrompt: string,
  diet: DietInfo,
  targetCalories: number
): Promise<{ plan: NormalizedMealPlan }> {
  const first = await chatCompletion({
    model: MEAL_PLAN_CONFIG.MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserMessage(targetCalories, diet, []) },
    ],
    temperature: MEAL_PLAN_CONFIG.TEMPERATURE,
    maxTokens: MEAL_PLAN_CONFIG.MAX_TOKENS,
    json: true,
  });

  const firstRes = await resolveAndValidateMealPlan(admin, parseMealPlanJson(first), diet);
  const offDays = daysOutsideTolerance(firstRes.plan, targetCalories, MEAL_PLAN_CONFIG.TOLERANCE_PCT);
  // The returned plan is already SAFE (violating foods are dropped). Retry only
  // to restore completeness / hit the calorie target.
  if (firstRes.violations.length === 0 && offDays.length === 0) return { plan: firstRes.plan };

  try {
    const repaired = await chatCompletion({
      model: MEAL_PLAN_CONFIG.MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserMessage(targetCalories, diet, firstRes.violations) },
        { role: "assistant", content: first },
        {
          role: "user",
          content: `Revise: DO NOT use these foods (they violated diet/allergy rules): ${firstRes.violations.join(", ") || "none"}. Adjust portions so each day is within ${Math.round(MEAL_PLAN_CONFIG.TOLERANCE_PCT * 100)}% of ${targetCalories} kcal. Return ONLY corrected JSON.`,
        },
      ],
      temperature: MEAL_PLAN_CONFIG.TEMPERATURE,
      maxTokens: MEAL_PLAN_CONFIG.MAX_TOKENS,
      json: true,
    });
    const repairedRes = await resolveAndValidateMealPlan(admin, parseMealPlanJson(repaired), diet);
    const repairedOff = daysOutsideTolerance(repairedRes.plan, targetCalories, MEAL_PLAN_CONFIG.TOLERANCE_PCT);
    // Prefer the tighter plan; both are safe.
    if (repairedOff.length <= offDays.length) return { plan: repairedRes.plan };
    return { plan: firstRes.plan };
  } catch {
    return { plan: firstRes.plan }; // first plan is safe; return it rather than fail
  }
}
