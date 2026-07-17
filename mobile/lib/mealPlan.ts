import { supabase } from "@/lib/supabase";
import { SUPABASE_URL, MEAL_PLAN } from "@/constants";
import { logFood } from "@/lib/api";
import type { NutritionLog } from "@/types";
import type { MealType } from "@/constants";
import type { TrialState } from "@/lib/aiPlan";

// ── Dietary profile (mirrors backend) ──────────────────────────────────────
export interface DietInfo {
  status: "skipped" | "provided";
  pattern?: string;
  allergies?: string[];
  dislikes?: string[];
  cuisines?: string[];
  budget?: string;
  cookTime?: string;
  mealsPerDay?: number;
  medicalConditions?: string[];
  /** ISO time the current allergy set was confirmed (confirm-on-change). */
  allergiesConfirmedAt?: string;
}

/** True when allergies exist but haven't been confirmed since last change. */
export function needsAllergyConfirmation(diet: DietInfo | null | undefined): boolean {
  if (!diet || (diet.allergies ?? []).length === 0) return false;
  return !diet.allergiesConfirmedAt;
}

// ── Generated plan shape (matches backend NormalizedMealPlan) ───────────────
export interface MealFood {
  name: string; foodId: string; grams: number;
  calories: number; protein: number; carbs: number; fat: number;
}
export interface MacroTotals { calories: number; protein: number; carbs: number; fat: number }
export interface Meal { mealType: string; name: string; foods: MealFood[]; totals: MacroTotals }
export interface MealDay { dayNumber: number; meals: Meal[]; totals: MacroTotals }
export interface GeneratedMealPlan {
  planName: string;
  durationDays: number;
  days: MealDay[];
  weeklyTotals: MacroTotals;
  notes?: string;
}

export interface SavedMealPlan {
  id: string;
  name: string;
  target_calories: number | null;
  plan: GeneratedMealPlan;
  created_at: string;
}

export type GenerateMealPlanResult =
  | { ok: true; plan: GeneratedMealPlan; targetCalories: number; softened: boolean; disclaimer: string }
  | {
      ok: false;
      code: "DIET_INFO_REQUIRED" | "MEDICAL_GATE" | "TRIAL_EXPIRED" | "RATE_LIMITED" | "ERROR";
      message: string;
    };

/** Calls the backend. Entitlement/trial/safety all resolved server-side. */
export async function generateMealPlan(dietInfo?: DietInfo): Promise<GenerateMealPlanResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: "ERROR", message: "You're not signed in." };
  const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, code: "ERROR", message: "Missing Supabase URL." };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/functions/v1/generate-meal-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(dietInfo ? { diet_info: dietInfo } : {}),
    });
  } catch {
    return { ok: false, code: "ERROR", message: "Network error. Please try again." };
  }

  const raw = await res.text().catch(() => "");
  let data: {
    plan?: GeneratedMealPlan; targetCalories?: number; softened?: boolean;
    disclaimer?: string; code?: string; error?: string;
  } = {};
  try { data = JSON.parse(raw); } catch { /* empty */ }

  if (res.ok && data.plan) {
    return {
      ok: true,
      plan: data.plan,
      targetCalories: data.targetCalories ?? 0,
      softened: !!data.softened,
      disclaimer: data.disclaimer ?? "",
    };
  }
  const code = data.code;
  if (code === "DIET_INFO_REQUIRED") return { ok: false, code: "DIET_INFO_REQUIRED", message: data.error ?? "" };
  if (code === "MEDICAL_GATE") return { ok: false, code: "MEDICAL_GATE", message: data.error ?? "" };
  if (code === "TRIAL_EXPIRED") return { ok: false, code: "TRIAL_EXPIRED", message: data.error ?? "Your free trial has ended." };
  if (res.status === 429 || code === "RATE_LIMITED") return { ok: false, code: "RATE_LIMITED", message: data.error ?? "Daily limit reached." };
  return { ok: false, code: "ERROR", message: data.error ?? "Could not generate a meal plan. Please try again." };
}

// ── Persistence: first-class records, independent of trial ──────────────────
// meal_plans isn't in the generated Database types yet (regenerate after the
// ai_meal_plan migration); cast the client until then.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

export async function saveMealPlan(plan: GeneratedMealPlan, targetCalories: number): Promise<SavedMealPlan> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await db()
    .from("meal_plans")
    .insert({ user_id: user.id, name: plan.planName, target_calories: targetCalories, plan })
    .select("*")
    .single();
  if (error) throw error;
  return data as SavedMealPlan;
}

export async function getMealPlans(): Promise<SavedMealPlan[]> {
  const { data, error } = await db()
    .from("meal_plans")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedMealPlan[];
}

export async function deleteMealPlan(id: string): Promise<void> {
  const { error } = await db().from("meal_plans").delete().eq("id", id);
  if (error) throw error;
}

// ── Log a plan's foods straight into the nutrition diary ────────────────────
/** Logs every food in these meals to nutrition_logs for the given date. */
export async function logMealsToDiary(meals: Meal[], date: string): Promise<number> {
  let logged = 0;
  for (const meal of meals) {
    for (const f of meal.foods) {
      await logFood({
        food_id: f.foodId,
        food_name: f.name,
        meal_type: meal.mealType as MealType,
        date,
        servings: 1,
        calories: f.calories,
        protein_g: f.protein,
        carbs_g: f.carbs,
        fat_g: f.fat,
        log_method: "manual",
        notes: "AI meal plan",
      } as Omit<NutritionLog, "id" | "user_id" | "created_at">);
      logged += 1;
    }
  }
  return logged;
}

// Re-export for screens that show both trials.
export type { TrialState };
export function trialDaysLeft(startedAt: string | null | undefined): number {
  if (!startedAt) return MEAL_PLAN.TRIAL_DAYS;
  const end = new Date(startedAt).getTime() + MEAL_PLAN.TRIAL_DAYS * 86400000;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}
