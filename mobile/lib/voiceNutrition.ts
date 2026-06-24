import { searchFoods } from "@/lib/api";
import type { VoiceParsedFoodItem } from "@/lib/api";

export type ResolvedVoiceLog = {
  food_id: string | null;
  food_name: string;
  servings: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export async function resolveVoiceItemMacros(
  item: VoiceParsedFoodItem
): Promise<ResolvedVoiceLog> {
  const servings = item.quantity > 0 ? item.quantity : 1;
  const hasAiMacros = item.calories > 0;

  if (hasAiMacros) {
    return {
      food_id: null,
      food_name: item.food_name,
      servings,
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
    };
  }

  const foods = await searchFoods(item.food_name);
  const match = foods[0];
  if (match) {
    return {
      food_id: match.id,
      food_name: match.name,
      servings,
      calories: match.calories_per_serving * servings,
      protein_g: match.protein_g * servings,
      carbs_g: match.carbs_g * servings,
      fat_g: match.fat_g * servings,
    };
  }

  return {
    food_id: null,
    food_name: item.food_name,
    servings,
    calories: item.calories,
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
  };
}
