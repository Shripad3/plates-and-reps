const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export function calculateGoalTargets(
  weightKg: number,
  heightCm: number,
  activityLevel: string,
  goalType: string
): {
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  target_weight_kg: number;
} {
  // Mifflin-St Jeor (neutral sex estimate, age 30)
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * 30 - 78;
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.375;
  let calories = Math.round(bmr * multiplier);

  if (goalType === "weight_loss") calories -= 500;
  else if (goalType === "muscle_gain") calories += 300;

  calories = Math.max(1200, calories);

  let targetWeight = weightKg;
  if (goalType === "weight_loss") targetWeight = Math.max(40, weightKg - 5);
  else if (goalType === "muscle_gain") targetWeight = weightKg + 3;

  return {
    target_calories: calories,
    target_protein_g: Math.round(weightKg * 1.8),
    target_carbs_g: Math.round((calories * 0.4) / 4),
    target_fat_g: Math.round((calories * 0.3) / 9),
    target_weight_kg: Math.round(targetWeight * 10) / 10,
  };
}
