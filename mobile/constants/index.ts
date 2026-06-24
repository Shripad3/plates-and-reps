export const APP_NAME = "Plates & Reps";
export const APP_AI_NAME = `${APP_NAME} AI`;
export const APP_PREMIUM_NAME = `${APP_NAME} Pro`;

export const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "shripad0304@gmail.com";

/** Public URLs for App Store Connect. */
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_URL ??
  "https://shripad3.github.io/plates-and-reps/privacy/";
export const TERMS_URL =
  process.env.EXPO_PUBLIC_TERMS_URL ??
  "https://shripad3.github.io/plates-and-reps/terms/";

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const FREE_TIER = {
  AI_CHAT_DAILY_LIMIT: 10,
  PHOTO_ANALYSIS_DAILY_LIMIT: 3,
  VOICE_LOG_DAILY_LIMIT: 5,
  HISTORY_DAYS: 30,
  WORKOUT_PLAN_MONTHLY: 1,
} as const;

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sedentary", description: "Little or no exercise" },
  { value: "lightly_active", label: "Lightly Active", description: "Exercise 1–3 days/week" },
  { value: "moderately_active", label: "Moderately Active", description: "Exercise 3–5 days/week" },
  { value: "very_active", label: "Very Active", description: "Hard exercise 6–7 days/week" },
  { value: "extra_active", label: "Extra Active", description: "Very hard exercise + physical job" },
] as const;

export const GOAL_TYPES = [
  { value: "weight_loss", label: "Lose Weight" },
  { value: "muscle_gain", label: "Build Muscle" },
  { value: "maintenance", label: "Maintain Weight" },
  { value: "custom", label: "Custom Goals" },
] as const;

export const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export const WEEKLY_WORKOUT_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  value: String(n),
  label: `${n} session${n === 1 ? "" : "s"} per week`,
}));

export const MUSCLE_GROUPS = [
  "chest", "back", "shoulders", "biceps", "triceps",
  "forearms", "core", "quads", "hamstrings", "glutes",
  "calves", "full_body", "cardio",
] as const;

export const CARDIO_TYPES = [
  { value: "run", label: "Run", icon: "🏃" },
  { value: "walk", label: "Walk", icon: "🚶" },
  { value: "cycle", label: "Cycle", icon: "🚴" },
  { value: "swim", label: "Swim", icon: "🏊" },
  { value: "rowing", label: "Rowing", icon: "🚣" },
  { value: "elliptical", label: "Elliptical", icon: "⬡" },
  { value: "other", label: "Other", icon: "💪" },
] as const;

export const REACTION_TYPES = [
  { value: "fire", emoji: "🔥" },
  { value: "flex", emoji: "💪" },
  { value: "heart", emoji: "❤️" },
  { value: "clap", emoji: "👏" },
] as const;
