import { supabase } from "@/lib/supabase";
import { SUPABASE_URL } from "@/constants";

// ── Response shapes (mirror _shared/workoutAnalysis.ts + analyze-workout) ─────
export interface AnalysisSubScores {
  balance: number;
  volume: number;
  goalFit: number;
  safety: number | null;
  progression: number | null;
}

export interface AnalysisProgression {
  exercise_id: string;
  name: string;
  trend: "up" | "flat" | "down" | "insufficient";
  detail: string;
}

export interface WorkoutAnalysis {
  exerciseCount: number;
  totalWorkingSets: number;
  unclassifiedExercises: string[];
  estDurationMin: number;
  muscleVolume: Record<string, number>;
  bodyMapIntensity: Record<string, number>;
  coverage: { trained: string[]; missing: string[] };
  balance: {
    pushSets: number; pullSets: number; upperSets: number; lowerSets: number; coreSets: number;
    pushPull: number | null; upperLower: number | null; flags: string[];
  };
  goalFit: {
    goal: string; repRange: [number, number];
    inRangeSets: number; outOfRangeSets: number; compoundRatio: number;
  };
  safety: { flags: { injury: string; exercises: string[] }[] };
  progression: AnalysisProgression[];
  subScores: AnalysisSubScores;
  score: number;
}

export interface AnalysisNarration {
  verdict: string;
  strengths: string[];
  recommendations: string[];
}

export interface AnalysisReport {
  workoutName: string;
  analysis: WorkoutAnalysis;
  narration: AnalysisNarration;
}

export type AnalyzeResult =
  | { ok: true; report: AnalysisReport }
  | { ok: false; code: "LIMIT_REACHED" | "RATE_LIMITED" | "EMPTY" | "ERROR"; message: string };

/** Calls analyze-workout. Entitlement / monthly free limit resolved server-side. */
export async function analyzeWorkoutTemplate(templateId: string): Promise<AnalyzeResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: "ERROR", message: "You're not signed in." };

  const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, code: "ERROR", message: "Missing Supabase URL." };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/functions/v1/analyze-workout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ template_id: templateId }),
    });
  } catch {
    return { ok: false, code: "ERROR", message: "Network error. Please try again." };
  }

  const raw = await res.text().catch(() => "");
  let data: (AnalysisReport & { code?: string; error?: string }) | Record<string, never> = {};
  try { data = JSON.parse(raw); } catch { /* leave empty */ }

  if (res.ok && (data as AnalysisReport).analysis) {
    return { ok: true, report: data as AnalysisReport };
  }

  const code = (data as { code?: string }).code;
  const message = (data as { error?: string }).error ?? "";
  if (code === "LIMIT_REACHED") return { ok: false, code: "LIMIT_REACHED", message };
  if (res.status === 429 || code === "RATE_LIMITED") return { ok: false, code: "RATE_LIMITED", message: message || "Limit reached." };
  if (res.status === 422) return { ok: false, code: "EMPTY", message: message || "This workout has no exercises to analyse." };
  return { ok: false, code: "ERROR", message: message || "Couldn't analyse this workout. Please try again." };
}
