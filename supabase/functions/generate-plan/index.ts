import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { AI_PLAN_CONFIG } from "../_shared/aiConfig.ts";
import { resolveEntitlement } from "../_shared/entitlement.ts";
import { chatCompletion, LlmError } from "../_shared/llmProvider.ts";
import {
  parsePlanJson,
  validateAndNormalizePlan,
  PlanValidationError,
  type InjuryInfo,
  type LibraryExercise,
  type NormalizedPlan,
} from "../_shared/planValidation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Injury input sanitization ─────────────────────────────────────────────
function sanitizeInjury(raw: unknown): InjuryInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = r.status === "provided" ? "provided" : r.status === "skipped" ? "skipped" : null;
  if (!status) return null;
  const strList = (v: unknown) =>
    Array.isArray(v)
      ? v.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 20)
      : [];
  return {
    status,
    areas: strList(r.areas),
    avoidMovements: strList(r.avoidMovements),
    notes: typeof r.notes === "string" ? r.notes.trim().slice(0, 1000) : "",
  };
}

// ── Prompt building ───────────────────────────────────────────────────────
// STATIC system prefix (exercise library + rules + schema) so provider prompt
// caching applies. Only user-specific context goes in the user message.
function buildSystemPrompt(_library: LibraryExercise[]): string {
  // Static, cache-friendly prefix. We intentionally do NOT enumerate the 850+
  // granular library names (the model paraphrases them anyway); instead we ask
  // for standard, widely-known movement names and resolve them to the library
  // by fuzzy match server-side. Unmatched/unsafe movements are dropped.
  return `You are an expert strength & conditioning coach generating a structured training program.

## RULES
- Use STANDARD, widely-known exercise names (e.g. "Barbell Squat", "Bench Press", "Deadlift", "Romanian Deadlift", "Pull-Up", "Overhead Press", "Bent-Over Row", "Lat Pulldown", "Leg Press", "Dumbbell Lunge", "Plank"). Avoid obscure or brand-specific names.
- Each training day MUST contain 4 to 7 exercises that form a COMPLETE session: compound lifts first, then accessories. Never return a day with only one exercise.
- Produce EXACTLY ONE week representing the repeating weekly split. Put week-to-week progression guidance (how to add load/reps over the program) in "notes".
- Give each exercise 3–4 sets with sensible rep targets for the goal. Use weightKg 0 when load should be self-selected (bodyweight or "work up to").
- Respect the requested days per week and session length.
- If injuries are provided, avoid movements that stress those areas.
- Return ONLY valid JSON. No prose, no markdown code fences, no commentary.

## OUTPUT JSON SCHEMA (return exactly this shape)
{
  "planName": "string",
  "goal": "string",
  "durationWeeks": ${AI_PLAN_CONFIG.DEFAULT_PLAN_WEEKS},
  "weeks": [
    { "weekNumber": 1, "days": [
      { "dayNumber": 1, "focus": "string (e.g. Push / Lower Body)", "exercises": [
        { "name": "string (standard exercise name)", "sets": [
          { "setNumber": 1, "reps": 10, "weightKg": 0, "notes": "optional string" }
        ] }
      ] }
    ] }
  ],
  "notes": "string — week-to-week progression guidance"
}`;
}

interface PlanRequest {
  goal?: string;
  experience_level?: string;
  equipment?: string[];
  days_per_week?: number;
  session_minutes?: number;
}

function buildUserMessage(
  req: PlanRequest,
  injury: InjuryInfo | null,
  context: string
): string {
  const inj =
    injury && injury.status === "provided"
      ? `Injuries/weak points — areas: ${(injury.areas ?? []).join(", ") || "none"}; avoid: ${(injury.avoidMovements ?? []).join(", ") || "none"}; notes: ${injury.notes || "none"}`
      : "No injuries declared.";
  return `Generate the weekly training split (ONE fully-detailed week) for a ${AI_PLAN_CONFIG.DEFAULT_PLAN_WEEKS}-week program. Every training day must have 4–7 exercises.
Goal: ${req.goal ?? "general fitness"}
Experience: ${req.experience_level ?? "beginner"}
Equipment: ${(req.equipment ?? []).join(", ") || "bodyweight only"}
Days per week: ${req.days_per_week ?? 3}
Session length: ${req.session_minutes ?? 45} minutes
${inj}
${context}`.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as PlanRequest & { injury_info?: unknown };

    // 2. Load profile (entitlement + stored injury)
    const { data: profile } = await admin
      .from("user_profiles")
      .select("injury_info")
      .eq("id", user.id)
      .single();
    if (!profile) return json({ error: "Profile not found" }, 404);

    // 3. Injury gate — ask exactly once, only if never collected.
    let injury: InjuryInfo | null = (profile.injury_info as InjuryInfo | null) ?? null;
    const incomingInjury = sanitizeInjury(body.injury_info);
    if (incomingInjury) {
      // Persist the user's answer (provided or skipped) and use it now.
      await admin.from("user_profiles").update({ injury_info: incomingInjury }).eq("id", user.id);
      injury = incomingInjury;
    } else if (injury == null) {
      return json({ code: "INJURY_INFO_REQUIRED", error: "Injury info needed before first plan." }, 428);
    }

    // 4. Entitlement (server-authoritative, per-feature trial)
    const entitlement = await resolveEntitlement(admin, user.id, "workout");
    if (!entitlement.allowed) {
      return json(
        { code: "TRIAL_EXPIRED", error: "Your free AI trial has ended. Upgrade to keep generating plans." },
        402
      );
    }
    const startTrialAfterSuccess = entitlement.startTrialAfterSuccess;

    // 5. Absolute daily safety cap (atomic; applies to everyone)
    const { data: allowed, error: capError } = await admin.rpc("consume_ai_usage", {
      p_user_id: user.id,
      p_feature: "generate_plan",
      p_limit: AI_PLAN_CONFIG.DAILY_SAFETY_LIMIT,
    });
    if (!capError && allowed === false) {
      return json(
        { code: "RATE_LIMITED", error: `Daily generation limit reached (${AI_PLAN_CONFIG.DAILY_SAFETY_LIMIT}/day). Try again tomorrow.` },
        429
      );
    }

    // 6. Exercise library + personalization context
    const { data: libRows } = await admin
      .from("exercises")
      .select("id, name, muscle_groups, search_aliases")
      .order("name");
    const library = (libRows ?? []) as LibraryExercise[];
    if (library.length === 0) return json({ error: "Exercise library unavailable" }, 503);

    const context = await loadContext(admin, user.id, true);

    const systemPrompt = buildSystemPrompt(library);
    const userMessage = buildUserMessage(body, injury, context);

    // 7. Generate + validate (one repair retry on invalid output)
    let plan: NormalizedPlan;
    try {
      plan = await generateAndValidate(systemPrompt, userMessage, library, injury);
    } catch (err) {
      if (err instanceof LlmError) {
        return json({ error: "The AI service is busy. Please try again in a moment." }, 503);
      }
      if (err instanceof PlanValidationError) {
        return json({ error: "Couldn't build a valid plan. Please try again." }, 502);
      }
      throw err;
    }

    // 8. Only NOW (success + validated) start the trial, if applicable.
    if (startTrialAfterSuccess) {
      await admin.rpc("start_ai_trial", { p_user_id: user.id, p_feature: "workout" });
    }

    return json({ plan });
  } catch (err) {
    console.error("[generate-plan]", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

async function generateAndValidate(
  systemPrompt: string,
  userMessage: string,
  library: LibraryExercise[],
  injury: InjuryInfo | null
): Promise<NormalizedPlan> {
  const first = await chatCompletion({
    model: AI_PLAN_CONFIG.MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: AI_PLAN_CONFIG.TEMPERATURE,
    maxTokens: AI_PLAN_CONFIG.MAX_TOKENS,
    json: true,
  });

  let firstPlan: NormalizedPlan | null = null;
  let reason = "";
  try {
    firstPlan = validateAndNormalizePlan(parsePlanJson(first), library, injury);
    if (!isSparse(firstPlan)) return firstPlan; // good, full plan
    reason = "some days had too few exercises";
  } catch (firstErr) {
    if (!(firstErr instanceof PlanValidationError)) throw firstErr;
    reason = firstErr.message;
  }

  // One repair retry — invalid OR too sparse. Push for full days explicitly.
  try {
    const repaired = await chatCompletion({
      model: AI_PLAN_CONFIG.MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
        { role: "assistant", content: first },
        {
          role: "user",
          content: `That response was not usable (${reason}). Regenerate ONLY valid JSON matching the schema. EVERY training day must contain 4–7 exercises using standard, well-known exercise names. No day may have fewer than 3 exercises.`,
        },
      ],
      temperature: AI_PLAN_CONFIG.TEMPERATURE,
      maxTokens: AI_PLAN_CONFIG.MAX_TOKENS,
      json: true,
    });
    const repairedPlan = validateAndNormalizePlan(parsePlanJson(repaired), library, injury);
    // Prefer whichever is denser; never regress to nothing.
    if (firstPlan && isSparse(repairedPlan) && !isSparse(firstPlan)) return firstPlan;
    return repairedPlan;
  } catch (repairErr) {
    if (firstPlan) return firstPlan; // fall back to the first valid plan
    throw repairErr;
  }
}

/**
 * Sparse if ANY training day has fewer than the per-day minimum (checked
 * per-day, not averaged — one full day must not mask a near-empty one).
 */
function isSparse(plan: NormalizedPlan): boolean {
  let anyDay = false;
  for (const w of plan.weeks) {
    for (const d of w.days) {
      anyDay = true;
      if (d.exercises.length < AI_PLAN_CONFIG.MIN_EXERCISES_PER_DAY) return true;
    }
  }
  return !anyDay;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadContext(admin: any, userId: string, entitled: boolean): Promise<string> {
  if (!entitled) return "";
  const [{ data: sessions }, { data: metrics }] = await Promise.all([
    admin.from("workout_sessions").select("name, started_at").eq("user_id", userId)
      .order("started_at", { ascending: false }).limit(8),
    admin.from("body_metrics").select("weight_kg, date").eq("user_id", userId)
      .order("date", { ascending: false }).limit(5),
  ]);
  const recent = (sessions ?? []).map((s: { name: string }) => s.name).join(", ");
  const weights = (metrics ?? []).map((m: { weight_kg: number }) => m.weight_kg);
  const trend =
    weights.length >= 2 ? `Weight trend (recent→older): ${weights.join(", ")} kg` : "";
  const parts = [];
  if (recent) parts.push(`Recent workouts: ${recent}`);
  if (trend) parts.push(trend);
  return parts.length ? `Personalization — ${parts.join(". ")}.` : "";
}
