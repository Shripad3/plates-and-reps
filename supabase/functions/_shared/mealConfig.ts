// Central config + safety guardrails for AI meal-plan generation.

export const MEAL_PLAN_CONFIG = {
  MODEL: "llama-3.3-70b-versatile",
  TEMPERATURE: 0.4,
  MAX_TOKENS: 6000,
  DURATION_DAYS: 7,
  DAILY_SAFETY_LIMIT: 20,
  /** Per-day computed calories must land within this of target. */
  TOLERANCE_PCT: 0.10,

  // ── Eating-disorder / medical guardrails (hard) ──
  /** Absolute per-day calorie floor, by sex. */
  CALORIE_FLOOR: { male: 1500, female: 1200, other: 1200 } as Record<string, number>,
  /** Never target more than this fraction below maintenance (TDEE). */
  MAX_DEFICIT_PCT: 0.25,
  /** Don't drive toward an underweight BMI. */
  BMI_FLOOR: 18.5,
  /** Under this age, soften (no aggressive deficit). */
  MINOR_AGE: 18,
  /** Declared conditions that route to "consult a professional" (no auto-gen). */
  MEDICAL_OFFRAMP: ["diabetes", "kidney_disease", "pregnancy", "eating_disorder"],
  DISCLAIMER: "This is general information, not medical or dietitian advice. Consult a professional before making dietary changes.",
} as const;

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Maintenance calories (Mifflin–St Jeor BMR × activity), same basis as onboarding. */
export function estimateTdee(
  weightKg: number,
  heightCm: number,
  activityLevel: string,
  ageYears: number,
  sex: string
): number {
  const sexConstant = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + sexConstant;
  return Math.round(bmr * (ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.375));
}

export interface MedicalGate {
  blocked: boolean;
  message?: string;
}
/** Off-ramp for declared conditions we won't auto-generate around. */
export function medicalGate(medicalConditions: string[] | undefined): MedicalGate {
  for (const c of medicalConditions ?? []) {
    if (MEAL_PLAN_CONFIG.MEDICAL_OFFRAMP.includes(norm(c))) {
      return {
        blocked: true,
        message:
          "Because of a health condition you told us about, we won't auto-generate a diet plan. Please work with a doctor or registered dietitian. " +
          MEAL_PLAN_CONFIG.DISCLAIMER,
      };
    }
  }
  return { blocked: false };
}

export interface ClampInput {
  target: number; // goal-adjusted target from user_goals
  tdee: number;
  sex: string;
  age: number | null;
  bmi: number | null;
}
export interface ClampResult {
  calories: number;
  softened: boolean; // true if a guardrail raised the target
}
/** Clamp the derived calorie target up to safe bounds before generation. */
export function clampCalorieTarget(input: ClampInput): ClampResult {
  const floor = MEAL_PLAN_CONFIG.CALORIE_FLOOR[input.sex] ?? MEAL_PLAN_CONFIG.CALORIE_FLOOR.other;
  let cal = input.target;
  let softened = false;

  // Minors: no aggressive deficit — don't go below maintenance.
  if (input.age != null && input.age < MEAL_PLAN_CONFIG.MINOR_AGE && cal < input.tdee) {
    cal = input.tdee;
    softened = true;
  }
  // Underweight: don't target a loss below maintenance.
  if (input.bmi != null && input.bmi < MEAL_PLAN_CONFIG.BMI_FLOOR && cal < input.tdee) {
    cal = input.tdee;
    softened = true;
  }
  // Cap the deficit vs maintenance.
  const maxDeficitFloor = Math.round(input.tdee * (1 - MEAL_PLAN_CONFIG.MAX_DEFICIT_PCT));
  if (cal < maxDeficitFloor) {
    cal = maxDeficitFloor;
    softened = true;
  }
  // Absolute floor.
  if (cal < floor) {
    cal = floor;
    softened = true;
  }
  return { calories: Math.round(cal), softened };
}
