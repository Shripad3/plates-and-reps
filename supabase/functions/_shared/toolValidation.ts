const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);
const GOAL_TYPES = new Set(["weight_loss", "muscle_gain", "maintenance", "custom"]);
const ACTIVITY_LEVELS = new Set([
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "extra_active",
]);
const SEX_VALUES = new Set(["male", "female", "other", "prefer_not_to_say"]);
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function validateToolArgs(
  name: string,
  args: Record<string, unknown>
): string | null {
  switch (name) {
    case "log_food": {
      if (!args.food_name || typeof args.food_name !== "string") {
        return "food_name is required";
      }
      if (!args.meal_type || !MEAL_TYPES.has(String(args.meal_type))) {
        return "meal_type must be breakfast, lunch, dinner, or snack";
      }
      const calories = toNumber(args.calories);
      if (calories <= 0 || calories > 10000) return "calories must be between 1 and 10000";
      const protein = toNumber(args.protein_g);
      const carbs = toNumber(args.carbs_g);
      const fat = toNumber(args.fat_g);
      if (protein < 0 || carbs < 0 || fat < 0) return "macros cannot be negative";
      if (protein > 500 || carbs > 1000 || fat > 500) return "macro values out of range";
      return null;
    }
    case "log_body_metric": {
      const weight = toNumber(args.weight_kg);
      if (weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) {
        return `weight_kg must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG}`;
      }
      return null;
    }
    case "update_goal": {
      if (args.goal_type && !GOAL_TYPES.has(String(args.goal_type))) {
        return "goal_type is invalid";
      }
      if (args.target_weight_kg != null) {
        const target = toNumber(args.target_weight_kg);
        if (target < MIN_WEIGHT_KG || target > MAX_WEIGHT_KG) {
          return `target_weight_kg must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG}`;
        }
      }
      return null;
    }
    case "update_profile": {
      if (
        args.height_cm == null &&
        !args.activity_level &&
        !args.display_name &&
        !args.sex
      ) {
        return "At least one profile field is required";
      }
      if (args.height_cm != null) {
        const height = toNumber(args.height_cm);
        if (height < MIN_HEIGHT_CM || height > MAX_HEIGHT_CM) {
          return `height_cm must be between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM}`;
        }
      }
      if (args.activity_level && !ACTIVITY_LEVELS.has(String(args.activity_level))) {
        return "activity_level is invalid";
      }
      if (args.sex && !SEX_VALUES.has(String(args.sex))) {
        return "sex is invalid";
      }
      if (args.display_name != null) {
        const name = String(args.display_name).trim();
        if (!name || name.length > 80) {
          return "display_name must be 1–80 characters";
        }
      }
      return null;
    }
    default:
      return null;
  }
}

export { toNumber };
