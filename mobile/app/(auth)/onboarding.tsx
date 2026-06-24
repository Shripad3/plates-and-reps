import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVITY_LEVELS, GOAL_TYPES } from "@/constants";
import { upsertGoal, updateProfile, logBodyMetric } from "@/lib/api";
import { calculateGoalTargets } from "@/lib/nutritionCalc";
import { todayLocal } from "@/lib/dates";
import { AppTextInput } from "@/components/AppTextInput";
import { Button } from "@/components/ui/Button";

const STEPS = ["goal", "details", "activity"] as const;
type Step = (typeof STEPS)[number];

const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;

function parseWeightKg(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseHeightCm(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export default function OnboardingScreen() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("goal");
  const [goalType, setGoalType] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function validateGoalStep(): boolean {
    if (!goalType) {
      Alert.alert("Required", "Please select your goal.");
      return false;
    }
    return true;
  }

  function validateDetailsStep(): boolean {
    const weight = parseWeightKg(weightKg);
    if (weight === null) {
      Alert.alert("Required", "Enter your current weight in kg.");
      return false;
    }
    if (weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) {
      Alert.alert("Invalid weight", `Enter a weight between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`);
      return false;
    }

    const height = parseHeightCm(heightCm);
    if (height === null) {
      Alert.alert("Required", "Enter your height in cm.");
      return false;
    }
    if (height < MIN_HEIGHT_CM || height > MAX_HEIGHT_CM) {
      Alert.alert("Invalid height", `Enter a height between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm.`);
      return false;
    }

    return true;
  }

  function validateActivityStep(): boolean {
    if (!activityLevel) {
      Alert.alert("Required", "Please select your activity level.");
      return false;
    }
    return true;
  }

  function next() {
    if (step === "goal" && !validateGoalStep()) return;
    if (step === "details" && !validateDetailsStep()) return;

    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }

  async function finish() {
    if (!validateGoalStep()) {
      setStep("goal");
      return;
    }
    if (!validateDetailsStep()) {
      setStep("details");
      return;
    }
    if (!validateActivityStep()) return;

    const parsedWeight = parseWeightKg(weightKg)!;
    const parsedHeight = parseHeightCm(heightCm)!;
    const targets = calculateGoalTargets(parsedWeight, parsedHeight, activityLevel, goalType);

    setIsLoading(true);

    try {
      const savedGoal = await upsertGoal({
        goal_type: goalType as "weight_loss" | "muscle_gain" | "maintenance" | "custom",
        target_weight_kg: targets.target_weight_kg,
        target_calories: targets.target_calories,
        target_protein_g: targets.target_protein_g,
        target_carbs_g: targets.target_carbs_g,
        target_fat_g: targets.target_fat_g,
        target_water_ml: 2500,
        weekly_workout_target: 3,
      });

      const savedProfile = await updateProfile({
        height_cm: parsedHeight,
        activity_level: activityLevel,
      });

      const metric = await logBodyMetric({
        date: todayLocal(),
        weight_kg: parsedWeight,
        body_fat_pct: null,
        measurements: null,
        notes: null,
      });
      queryClient.setQueryData(["body-metrics"], (old: typeof metric[] | undefined) =>
        old ? [...old, metric] : [metric]
      );

      queryClient.setQueryData(["goal"], savedGoal);
      queryClient.setQueryData(["profile"], savedProfile);

      router.replace("/(tabs)/home");
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
    <View className="flex-1 px-6 pt-4">
      {/* Progress indicator */}
      <View className="flex-row gap-2 mb-8">
        {STEPS.map((s) => (
          <View
            key={s}
            className={`flex-1 h-1 rounded-full ${
              STEPS.indexOf(s) <= STEPS.indexOf(step)
                ? "bg-brand-500"
                : "bg-surface-elevated"
            }`}
          />
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        {step === "goal" && (
          <View>
            <Text className="text-white text-2xl font-bold mb-2">What's your goal?</Text>
            <Text className="text-slate-400 mb-6">We'll tailor your experience to help you get there.</Text>
            <View className="gap-3">
              {GOAL_TYPES.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  className={`rounded-xl p-4 border ${
                    goalType === g.value
                      ? "bg-brand-500/15 border-brand-500"
                      : "bg-surface-card border-surface-border"
                  }`}
                  onPress={() => setGoalType(g.value)}
                >
                  <Text className={`font-semibold text-base ${goalType === g.value ? "text-brand-400" : "text-white"}`}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === "details" && (
          <View>
            <Text className="text-white text-2xl font-bold mb-2">Your stats</Text>
            <Text className="text-slate-400 mb-6">Used to calculate calorie targets.</Text>
            <View className="gap-4">
              <View>
                <Text className="text-slate-400 text-sm mb-1.5">Current weight (kg)</Text>
                <AppTextInput
                  placeholder="e.g. 75"
                  keyboardType="decimal-pad"
                  value={weightKg}
                  onChangeText={setWeightKg}
                />
              </View>
              <View>
                <Text className="text-slate-400 text-sm mb-1.5">Height (cm)</Text>
                <AppTextInput
                  placeholder="e.g. 175"
                  keyboardType="decimal-pad"
                  value={heightCm}
                  onChangeText={setHeightCm}
                />
              </View>
            </View>
          </View>
        )}

        {step === "activity" && (
          <View>
            <Text className="text-white text-2xl font-bold mb-2">Activity level</Text>
            <Text className="text-slate-400 mb-6">How active are you on a typical week?</Text>
            <View className="gap-3">
              {ACTIVITY_LEVELS.map((a) => (
                <TouchableOpacity
                  key={a.value}
                  className={`rounded-xl p-4 border ${
                    activityLevel === a.value
                      ? "bg-brand-500/15 border-brand-500"
                      : "bg-surface-card border-surface-border"
                  }`}
                  onPress={() => setActivityLevel(a.value)}
                >
                  <Text className={`font-semibold ${activityLevel === a.value ? "text-brand-400" : "text-white"}`}>
                    {a.label}
                  </Text>
                  <Text className="text-slate-500 text-sm mt-0.5">{a.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View className="pb-8 pt-4">
        {step !== "activity" ? (
          <Button label="Continue" onPress={next} disabled={step === "goal" && !goalType} fullWidth />
        ) : (
          <Button
            label={isLoading ? "Setting up…" : "Get started"}
            onPress={finish}
            loading={isLoading}
            disabled={!activityLevel}
            fullWidth
          />
        )}
      </View>
    </View>
    </SafeAreaView>
  );
}
