import { supabase } from "@/lib/supabase";
import { SUPABASE_URL, AI_PLAN } from "@/constants";
import { createWorkoutTemplate } from "@/lib/api";
import type { WorkoutTemplate } from "@/types";

// ── Injury info (mirrors backend) ──────────────────────────────────────────
export type InjuryStatus = "not_collected" | "skipped" | "provided";

export interface InjuryInfo {
  status: "skipped" | "provided";
  areas?: string[];
  avoidMovements?: string[];
  notes?: string;
}

/** Three-state resolution from the stored profile value (null = not collected). */
export function injuryStatus(stored: InjuryInfo | null | undefined): InjuryStatus {
  if (!stored) return "not_collected";
  return stored.status === "provided" ? "provided" : "skipped";
}

// ── Generated plan shape (matches _shared/planValidation.ts output) ─────────
export interface PlanSet { setNumber: number; reps: number; weightKg: number; notes?: string }
export interface PlanExercise { name: string; exerciseId: string; muscleGroups: string[]; sets: PlanSet[] }
export interface PlanDay { dayNumber: number; focus: string; exercises: PlanExercise[] }
export interface PlanWeek { weekNumber: number; days: PlanDay[] }
export interface GeneratedPlan {
  planName: string;
  goal: string;
  durationWeeks: number;
  weeks: PlanWeek[];
  notes?: string;
}

export interface GeneratePlanInput {
  goal: string;
  experience_level: string;
  equipment: string[];
  days_per_week: number;
  session_minutes: number;
  injury_info?: InjuryInfo;
}

export type GeneratePlanResult =
  | { ok: true; plan: GeneratedPlan }
  | {
      ok: false;
      code: "INJURY_INFO_REQUIRED" | "TRIAL_EXPIRED" | "RATE_LIMITED" | "ERROR";
      message: string;
    };

/** Calls the backend. All entitlement/trial logic is resolved server-side. */
export async function generatePlan(input: GeneratePlanInput): Promise<GeneratePlanResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: "ERROR", message: "You're not signed in." };

  const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, code: "ERROR", message: "Missing Supabase URL." };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/functions/v1/generate-plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, code: "ERROR", message: "Network error. Please try again." };
  }

  const raw = await res.text().catch(() => "");
  let data: { plan?: GeneratedPlan; code?: string; error?: string } = {};
  try { data = JSON.parse(raw); } catch { /* leave empty */ }

  if (res.ok && data.plan) return { ok: true, plan: data.plan };

  const code = data.code;
  if (code === "INJURY_INFO_REQUIRED") {
    return { ok: false, code: "INJURY_INFO_REQUIRED", message: data.error ?? "" };
  }
  if (code === "TRIAL_EXPIRED") {
    return { ok: false, code: "TRIAL_EXPIRED", message: data.error ?? "Your free trial has ended." };
  }
  if (res.status === 429 || code === "RATE_LIMITED") {
    return { ok: false, code: "RATE_LIMITED", message: data.error ?? "Daily limit reached." };
  }
  return { ok: false, code: "ERROR", message: data.error ?? "Could not generate a plan. Please try again." };
}

/**
 * Convert a generated plan into first-class routines using the existing
 * template model — one routine per day of week 1 (the split). Progression
 * across later weeks lives in the plan notes. These are normal routines with
 * no AI-trial dependency and stay runnable regardless of trial/subscription.
 */
export async function savePlanAsRoutines(plan: GeneratedPlan): Promise<WorkoutTemplate[]> {
  const week1 = plan.weeks[0];
  if (!week1) return [];

  const created: WorkoutTemplate[] = [];
  for (const day of week1.days) {
    const template = await createWorkoutTemplate({
      user_id: "",
      is_public: false,
      name: `${plan.planName} · ${day.focus}`.slice(0, 80),
      description: `AI plan · ${plan.goal} · week 1 of ${plan.durationWeeks}`.slice(0, 300),
      exercises: day.exercises.map((ex, i) => ({
        exercise_id: ex.exerciseId,
        order: i,
        sets: ex.sets.map((s) => ({
          target_reps: s.reps,
          target_weight_kg: s.weightKg > 0 ? s.weightKg : null,
          rest_seconds: 90,
        })),
      })),
    });
    created.push(template);
  }
  return created;
}

// ── Trial state for the UI (display only; server is authoritative) ──────────
export interface TrialState {
  status: "not_started" | "active" | "expired" | "premium";
  daysLeft: number;
}

/** Per-feature trial start time from ai_trials (RLS-scoped to the user). */
export async function getAiTrialStartedAt(feature: string): Promise<string | null> {
  // ai_trials isn't in the generated Database types yet (regenerate after the
  // ai_meal_plan migration); cast until then.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("ai_trials")
    .select("started_at")
    .eq("feature", feature)
    .maybeSingle();
  return (data as { started_at?: string } | null)?.started_at ?? null;
}

export function resolveTrialState(
  isPremium: boolean,
  aiTrialStartedAt: string | null | undefined
): TrialState {
  if (isPremium) return { status: "premium", daysLeft: 0 };
  if (!aiTrialStartedAt) return { status: "not_started", daysLeft: AI_PLAN.TRIAL_DAYS };
  const end = new Date(aiTrialStartedAt).getTime() + AI_PLAN.TRIAL_DAYS * 86400000;
  const msLeft = end - Date.now();
  if (msLeft <= 0) return { status: "expired", daysLeft: 0 };
  return { status: "active", daysLeft: Math.ceil(msLeft / 86400000) };
}
