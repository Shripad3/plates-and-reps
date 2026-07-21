import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { ANALYSIS_CONFIG } from "../_shared/analysisConfig.ts";
import { chatCompletion, LlmError } from "../_shared/llmProvider.ts";
import {
  analyzeWorkout,
  type AnalysisExercise,
  type AnalysisGoal,
  type ExerciseHistoryPoint,
  type WorkoutAnalysis,
} from "../_shared/workoutAnalysis.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const GOAL_MAP: Record<string, AnalysisGoal> = {
  muscle_gain: "build_muscle",
  weight_loss: "lose_fat",
  maintenance: "general_fitness",
  custom: "general_fitness",
};

interface TemplateExerciseRow {
  exercise_id: string;
  sets?: { target_reps?: number | null }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function narrationFacts(a: WorkoutAnalysis, workoutName: string, goal: AnalysisGoal): string {
  const s = a.subScores;
  const lines = [
    `Workout: "${workoutName}" · goal: ${goal.replace("_", " ")}`,
    `Overall score: ${a.score}/100 (balance ${s.balance}, volume ${s.volume}, goal-fit ${s.goalFit}` +
      `${s.safety != null ? `, safety ${s.safety}` : ""}${s.progression != null ? `, progression ${s.progression}` : ""})`,
    `${a.exerciseCount} exercises, ${a.totalWorkingSets} working sets, ~${a.estDurationMin} min.`,
    `Muscles trained: ${a.coverage.trained.join(", ") || "none"}.`,
    `Not trained: ${a.coverage.missing.join(", ") || "none"}.`,
    `Push sets ${a.balance.pushSets} / pull sets ${a.balance.pullSets} / lower ${a.balance.lowerSets} / core ${a.balance.coreSets}.`,
    a.balance.flags.length ? `Balance issues: ${a.balance.flags.join(" ")}` : "Balance: no major issues.",
    `Goal rep range ${a.goalFit.repRange[0]}-${a.goalFit.repRange[1]}: ${a.goalFit.inRangeSets} sets in range, ${a.goalFit.outOfRangeSets} out; compound ratio ${a.goalFit.compoundRatio}.`,
    a.safety.flags.length
      ? `Injury flags: ${a.safety.flags.map((f) => `${f.injury} vs ${f.exercises.join("/")}`).join("; ")}`
      : "No declared injury conflicts.",
    a.progression.some((p) => p.trend !== "insufficient")
      ? `Progression: ${a.progression.filter((p) => p.trend !== "insufficient").map((p) => `${p.name} ${p.trend}`).join(", ")}.`
      : "Progression: not enough logged history.",
  ];
  if (a.unclassifiedExercises.length) {
    lines.push(`Note: ${a.unclassifiedExercises.length} exercise(s) have no muscle data and were excluded from coverage.`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an expert strength & conditioning coach writing a short, honest, motivating review of ONE of the user's workouts.

You are given COMPUTED FACTS. Rules:
- NEVER contradict the facts or invent numbers, exercises, or muscles not present.
- Be specific and reference the actual numbers/muscles.
- Encouraging but honest — name real weaknesses.
- This is general fitness information, not medical advice.

Return ONLY valid JSON (no markdown, no prose) in this exact shape:
{
  "verdict": "one punchy sentence, <= 140 chars, summarising the workout",
  "strengths": ["2-3 short strings, each a genuine strength"],
  "recommendations": ["3-4 short, concrete, actionable improvements"]
}`;

interface Narration {
  verdict: string;
  strengths: string[];
  recommendations: string[];
}

function parseNarration(raw: string): Narration | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const arr = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : [];
    const verdict = typeof j.verdict === "string" ? j.verdict.trim().slice(0, 200) : "";
    const strengths = arr(j.strengths);
    const recommendations = arr(j.recommendations);
    if (!verdict && strengths.length === 0 && recommendations.length === 0) return null;
    return { verdict, strengths, recommendations };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } },
    ).auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as { template_id?: string };
    const templateId = typeof body.template_id === "string" ? body.template_id : "";
    if (!templateId) return json({ error: "template_id is required" }, 400);

    // Entitlement: premium = high monthly safety ceiling; free = small monthly allowance.
    const { data: profile } = await admin
      .from("user_profiles")
      .select("is_premium, premium_until, injury_info")
      .eq("id", user.id)
      .single();
    const isPremium =
      !!profile?.is_premium &&
      (!profile.premium_until || new Date(profile.premium_until).getTime() > Date.now());
    const monthlyLimit = isPremium ? ANALYSIS_CONFIG.PREMIUM_MONTHLY_SAFETY : ANALYSIS_CONFIG.FREE_MONTHLY_LIMIT;

    const { data: allowed, error: capError } = await admin.rpc("consume_ai_usage_monthly", {
      p_user_id: user.id,
      p_feature: "workout_analysis",
      p_limit: monthlyLimit,
    });
    if (!capError && allowed === false) {
      return json(
        isPremium
          ? { code: "RATE_LIMITED", error: "Monthly analysis limit reached. Try again next month." }
          : { code: "LIMIT_REACHED", error: `You've used all ${ANALYSIS_CONFIG.FREE_MONTHLY_LIMIT} free analyses this month. Upgrade for unlimited reviews.` },
        isPremium ? 429 : 402,
      );
    }

    // Load the selected workout (RLS bypass via service; verify ownership).
    const { data: template } = await admin
      .from("workout_templates")
      .select("id, user_id, name, exercises")
      .eq("id", templateId)
      .single();
    if (!template || template.user_id !== user.id) return json({ error: "Workout not found" }, 404);

    const templateExercises = (Array.isArray(template.exercises) ? template.exercises : []) as TemplateExerciseRow[];
    const parsed = templateExercises
      .map((te) => ({
        exercise_id: String(te.exercise_id),
        sets: Array.isArray(te.sets) ? te.sets.length : 0,
        target_reps: Array.isArray(te.sets) && te.sets[0]?.target_reps != null ? Number(te.sets[0].target_reps) : null,
      }))
      .filter((te) => te.exercise_id && te.sets > 0);

    if (parsed.length === 0) return json({ error: "This workout has no exercises to analyse." }, 422);

    const exerciseIds = [...new Set(parsed.map((p) => p.exercise_id))];

    // Exercise metadata (muscle groups etc.)
    const { data: meta } = await admin
      .from("exercises")
      .select("id, name, muscle_groups, equipment, category")
      .in("id", exerciseIds);
    const metaById = new Map((meta ?? []).map((m: Record<string, unknown>) => [m.id as string, m]));

    const exercises: AnalysisExercise[] = parsed.map((p) => {
      const m = metaById.get(p.exercise_id);
      return {
        exercise_id: p.exercise_id,
        name: (m?.name as string) ?? "Exercise",
        muscle_groups: (m?.muscle_groups as string[]) ?? [],
        equipment: (m?.equipment as string[]) ?? [],
        category: (m?.category as string) ?? "strength",
        sets: p.sets,
        target_reps: p.target_reps,
      };
    });

    // History: last N days of logged sets for these exercises.
    const history: Record<string, ExerciseHistoryPoint[]> = {};
    const since = new Date(Date.now() - ANALYSIS_CONFIG.HISTORY_DAYS * 86400000).toISOString();
    const { data: sessions } = await admin
      .from("workout_sessions")
      .select("id, started_at")
      .eq("user_id", user.id)
      .gte("started_at", since)
      .order("started_at", { ascending: true });
    const sessionRows = (sessions ?? []) as { id: string; started_at: string }[];
    if (sessionRows.length > 0) {
      const sessionOrder = new Map(sessionRows.map((s, i) => [s.id, i]));
      const sessionDate = new Map(sessionRows.map((s) => [s.id, s.started_at]));
      const { data: sets } = await admin
        .from("workout_sets")
        .select("session_id, exercise_id, reps, weight_kg")
        .in("session_id", sessionRows.map((s) => s.id))
        .in("exercise_id", exerciseIds);

      // Group: exercise_id -> session_id -> aggregate.
      const agg = new Map<string, Map<string, { topW: number; topR: number; vol: number }>>();
      for (const st of (sets ?? []) as { session_id: string; exercise_id: string; reps: number | null; weight_kg: number | null }[]) {
        const reps = st.reps ?? 0;
        const w = st.weight_kg ?? 0;
        if (!agg.has(st.exercise_id)) agg.set(st.exercise_id, new Map());
        const bySession = agg.get(st.exercise_id)!;
        const cur = bySession.get(st.session_id) ?? { topW: 0, topR: 0, vol: 0 };
        cur.vol += reps * w;
        if (w > cur.topW) { cur.topW = w; cur.topR = reps; }
        bySession.set(st.session_id, cur);
      }
      for (const [exId, bySession] of agg) {
        const points: ExerciseHistoryPoint[] = [...bySession.entries()]
          .sort((a, b) => (sessionOrder.get(a[0]) ?? 0) - (sessionOrder.get(b[0]) ?? 0))
          .map(([sid, v]) => ({
            date: sessionDate.get(sid) ?? since,
            top_weight_kg: v.topW || null,
            top_reps: v.topR || null,
            total_volume: v.vol,
          }));
        history[exId] = points;
      }
    }

    // Goal from user_goals.
    const { data: goalRow } = await admin
      .from("user_goals")
      .select("goal_type")
      .eq("user_id", user.id)
      .maybeSingle();
    const goal: AnalysisGoal = GOAL_MAP[(goalRow?.goal_type as string) ?? ""] ?? "general_fitness";

    // Injuries from stored profile.
    const injuryInfo = (profile?.injury_info ?? null) as { status?: string; areas?: string[] } | null;
    const injuries = injuryInfo?.status === "provided" && Array.isArray(injuryInfo.areas) ? injuryInfo.areas : [];

    // ---- Deterministic analysis ----
    const analysis = analyzeWorkout({ exercises, goal, injuries, history });

    // ---- LLM narration (graceful: analysis still returns if the LLM fails) ----
    let narration: Narration = { verdict: "", strengths: [], recommendations: [] };
    try {
      const raw = await chatCompletion({
        model: ANALYSIS_CONFIG.MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: narrationFacts(analysis, template.name as string, goal) },
        ],
        temperature: ANALYSIS_CONFIG.TEMPERATURE,
        maxTokens: ANALYSIS_CONFIG.MAX_TOKENS,
        json: true,
      });
      narration = parseNarration(raw) ?? narration;
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      // Leave narration empty; the deterministic report is still fully useful.
    }

    return json({ workoutName: template.name, analysis, narration });
  } catch (err) {
    console.error("[analyze-workout]", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
