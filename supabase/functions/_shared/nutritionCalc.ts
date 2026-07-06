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
  goalType: string,
  ageYears: number = 30,
  sex: string = "other"
): {
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  target_weight_kg: number;
  target_water_ml: number;
} {
  // Mifflin-St Jeor BMR with actual age and sex
  const sexConstant = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + sexConstant;
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.375;
  let calories = Math.round(bmr * multiplier);

  if (goalType === "weight_loss") calories -= 500;
  else if (goalType === "muscle_gain") calories += 300;

  calories = Math.max(1200, calories);

  let targetWeight = weightKg;
  if (goalType === "weight_loss") targetWeight = Math.max(40, weightKg - 5);
  else if (goalType === "muscle_gain") targetWeight = weightKg + 3;

  // Protein: 1.8g/kg body weight (sports nutrition standard)
  const proteinG = Math.round(weightKg * 1.8);
  // Fat: 30% of total calories
  const fatG = Math.round((calories * 0.3) / 9);
  // Carbs: fill remaining calories after protein + fat so macros sum to target
  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  const carbsG = Math.round(Math.max(0, calories - proteinKcal - fatKcal) / 4);

  // Water: 35ml/kg, rounded to nearest 250ml, clamped 2000–4000ml
  const rawWaterMl = Math.round((weightKg * 35) / 250) * 250;
  const targetWaterMl = Math.max(2000, Math.min(4000, rawWaterMl));

  return {
    target_calories: calories,
    target_protein_g: proteinG,
    target_carbs_g: carbsG,
    target_fat_g: fatG,
    target_weight_kg: Math.round(targetWeight * 10) / 10,
    target_water_ml: targetWaterMl,
  };
}
