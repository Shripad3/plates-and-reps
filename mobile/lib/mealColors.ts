import type { MealType } from "@/constants";
import { colors } from "@/lib/theme";

export const MEAL_COLORS: Record<MealType, string> = {
  breakfast: colors.meal.breakfast,
  lunch: colors.meal.lunch,
  dinner: colors.meal.dinner,
  snack: colors.meal.snack,
};
