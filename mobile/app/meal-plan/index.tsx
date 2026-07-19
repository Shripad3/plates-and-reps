import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { MealPlanSkeleton } from "@/components/skeletons/MealPlanSkeleton";
import { KeyboardAwareScreen } from "@/components/KeyboardAwareScreen";
import { router, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { MEAL_PLAN } from "@/constants";
import { colors } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { DietForm } from "@/components/DietForm";
import { navigateToPaywall } from "@/lib/navigateToPaywall";
import { resolveTrialState, getAiTrialStartedAt } from "@/lib/aiPlan";
import {
  generateMealPlan,
  saveMealPlan,
  getMealPlans,
  deleteMealPlan,
  logMealsToDiary,
  needsAllergyConfirmation,
  type GeneratedMealPlan,
  type SavedMealPlan,
  type DietInfo,
  type Meal,
} from "@/lib/mealPlan";

type Phase = "entry" | "diet" | "confirm" | "loading" | "result" | "gated";

export default function MealPlanScreen() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const { data: trialStartedAt } = useQuery({
    queryKey: ["ai-trial", "meal"],
    queryFn: () => getAiTrialStartedAt("meal"),
  });

  const { data: savedPlans = [] } = useQuery({ queryKey: ["meal-plans"], queryFn: getMealPlans });

  const [phase, setPhase] = useState<Phase>("entry");
  const [plan, setPlan] = useState<GeneratedMealPlan | null>(null);
  const [targetCalories, setTargetCalories] = useState(0);
  const [disclaimer, setDisclaimer] = useState("");
  const [gateMessage, setGateMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewingSaved, setViewingSaved] = useState(false);
  const [loggingMealKey, setLoggingMealKey] = useState<string | null>(null);

  const diet = (profile?.diet_info as DietInfo | null) ?? null;
  const trial = useMemo(
    () => resolveTrialState(!!profile?.is_premium, trialStartedAt),
    [profile?.is_premium, trialStartedAt]
  );

  async function runGenerate(dietOverride?: DietInfo) {
    setPhase("loading");
    const result = await generateMealPlan(dietOverride);
    if (result.ok) {
      setPlan(result.plan);
      setTargetCalories(result.targetCalories);
      setDisclaimer(result.disclaimer);
      setViewingSaved(false);
      setPhase("result");
      queryClient.invalidateQueries({ queryKey: ["ai-trial", "meal"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      return;
    }
    switch (result.code) {
      case "DIET_INFO_REQUIRED": setPhase("diet"); return;
      case "MEDICAL_GATE": setGateMessage(result.message); setPhase("gated"); return;
      case "TRIAL_EXPIRED":
        setPhase("entry");
        Alert.alert("Trial ended", result.message, [
          { text: "Not now", style: "cancel" },
          { text: "Upgrade", onPress: navigateToPaywall },
        ]);
        return;
      default:
        setPhase("entry");
        Alert.alert("Couldn't generate", result.message);
    }
  }

  // Entry "Generate" — route through diet collection / allergy confirmation first.
  function handleGenerate() {
    if (trial.status === "expired") { navigateToPaywall(); return; }
    if (!diet) { setPhase("diet"); return; }
    if (needsAllergyConfirmation(diet)) { setPhase("confirm"); return; }
    runGenerate();
  }

  async function handleSave() {
    if (!plan) return;
    setSaving(true);
    try {
      await saveMealPlan(plan, targetCalories);
      await queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      setViewingSaved(true);
      Alert.alert("Saved", "This plan is in your saved meal plans.", [{ text: "OK" }]);
    } catch (err) {
      Alert.alert("Save failed", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openSaved(sp: SavedMealPlan) {
    setPlan(sp.plan);
    setTargetCalories(sp.target_calories ?? 0);
    setDisclaimer("");
    setViewingSaved(true);
    setPhase("result");
  }

  function handleDeleteSaved(sp: SavedMealPlan) {
    Alert.alert("Delete plan?", `Remove "${sp.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMealPlan(sp.id);
            queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
          } catch (err) {
            Alert.alert("Delete failed", (err as Error).message);
          }
        },
      },
    ]);
  }

  async function handleLogMeal(meal: Meal, key: string) {
    setLoggingMealKey(key);
    try {
      const n = await logMealsToDiary([meal], todayLocal());
      await queryClient.invalidateQueries({ queryKey: ["nutrition", todayLocal()] });
      Alert.alert("Logged", `Added ${n} item${n !== 1 ? "s" : ""} to today's ${meal.mealType}.`);
    } catch (err) {
      Alert.alert("Log failed", (err as Error).message);
    } finally {
      setLoggingMealKey(null);
    }
  }

  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <View className="px-5 pt-2 pb-3 flex-row items-center justify-between border-b border-surface-border">
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-brand-400 text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-white font-semibold text-base">AI Meal Plan</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAwareScreen style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {trial.status !== "premium" && phase === "entry" && (
            <Card className="mb-5">
              {trial.status === "not_started" && (
                <Text className="text-white text-sm">✨ Try it free for {MEAL_PLAN.TRIAL_DAYS} days — starts when you generate your first plan.</Text>
              )}
              {trial.status === "active" && (
                <Text className="text-white text-sm">Trial: {trial.daysLeft} day{trial.daysLeft !== 1 ? "s" : ""} left</Text>
              )}
              {trial.status === "expired" && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-slate-300 text-sm flex-1">Your free trial has ended.</Text>
                  <Button label="Upgrade" size="sm" onPress={navigateToPaywall} />
                </View>
              )}
            </Card>
          )}

          {phase === "loading" && (
            <View>
              <Text className="text-slate-400 text-sm">Building your meal plan…</Text>
              <Text className="text-slate-600 text-xs mt-1 mb-4">Looking up foods & computing macros</Text>
              <MealPlanSkeleton />
            </View>
          )}

          {phase === "diet" && (
            <View>
              <Text className="text-white text-lg font-bold mb-1">Tell us about your diet</Text>
              <Text className="text-slate-400 text-sm mb-5">Allergies are enforced strictly. You can skip the rest.</Text>
              <DietForm
                initial={diet}
                saveLabel="Save & generate"
                onSubmit={(info) => runGenerate(info)}
                onSkip={() => runGenerate({ status: "skipped" })}
              />
            </View>
          )}

          {phase === "confirm" && diet && (
            <View>
              <Text className="text-white text-lg font-bold mb-2">Confirm your allergies</Text>
              <Text className="text-slate-400 text-sm mb-3">We'll never include these in your plan:</Text>
              <View className="flex-row flex-wrap mb-6">
                {(diet.allergies ?? []).map((a) => (
                  <View key={a} className="bg-red-500/15 border border-red-500/30 rounded-full px-3 py-1.5 mr-2 mb-2">
                    <Text className="text-red-400 text-sm">{a.replace(/_/g, " ")}</Text>
                  </View>
                ))}
              </View>
              <View className="gap-2">
                <Button
                  label="Confirm & generate"
                  onPress={() => runGenerate({ ...diet, allergiesConfirmedAt: new Date().toISOString() })}
                  fullWidth
                />
                <TouchableOpacity className="py-3 items-center" onPress={() => router.push("/(tabs)/profile" as Href)}>
                  <Text className="text-brand-400 text-sm">Edit diet & allergies in Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {phase === "gated" && (
            <View className="items-center py-10 px-2" style={{ gap: 16 }}>
              <Text className="text-white text-lg font-bold text-center">Let's keep this safe</Text>
              <Text className="text-slate-400 text-sm text-center leading-6">{gateMessage}</Text>
              <Button label="Back" variant="ghost" onPress={() => setPhase("entry")} />
            </View>
          )}

          {phase === "result" && plan && (
            <View>
              <Text className="text-white text-2xl font-bold tracking-tight">{plan.planName}</Text>
              <Text className="text-slate-400 text-sm mt-1 mb-1">
                {plan.durationDays} days · target {targetCalories} kcal/day
              </Text>
              {plan.notes ? <Text className="text-slate-300 text-sm mb-3">{plan.notes}</Text> : null}

              {!viewingSaved && (
                <Button label="Save plan" onPress={handleSave} loading={saving} fullWidth className="mb-4" />
              )}

              {plan.days.map((day) => (
                <Card key={day.dayNumber} className="mb-3">
                  <Text className="text-white font-semibold mb-1">Day {day.dayNumber}</Text>
                  <Text className="text-slate-500 text-xs mb-2">
                    {day.totals.calories} kcal · {day.totals.protein}p · {day.totals.carbs}c · {day.totals.fat}f
                  </Text>
                  {day.meals.map((meal, mi) => {
                    const key = `${day.dayNumber}-${mi}`;
                    return (
                      <View key={key} className="mt-2 pt-2 border-t border-surface-border">
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-slate-300 text-sm font-medium capitalize">
                            {meal.mealType}
                            <Text className="text-slate-500"> · {meal.totals.calories} kcal</Text>
                          </Text>
                          <TouchableOpacity
                            className="bg-brand-500/15 rounded-lg px-2.5 py-1"
                            onPress={() => handleLogMeal(meal, key)}
                            disabled={loggingMealKey === key}
                          >
                            <Text className="text-brand-400 text-xs font-semibold">
                              {loggingMealKey === key ? "Logging…" : "Log"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {meal.foods.map((f, fi) => (
                          <Text key={fi} className="text-slate-500 text-xs">
                            {f.name} · {f.grams}g · {f.calories} kcal
                          </Text>
                        ))}
                      </View>
                    );
                  })}
                </Card>
              ))}

              {disclaimer ? <Text className="text-slate-600 text-xs mb-4 mt-1">{disclaimer}</Text> : null}
              <TouchableOpacity className="py-3 items-center" onPress={() => { setViewingSaved(false); setPhase("entry"); }}>
                <Text className="text-slate-400 text-sm">{viewingSaved ? "Back" : "Start over"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === "entry" && (
            <View>
              <Text className="text-white text-2xl font-bold tracking-tight mb-2">AI Meal Plan</Text>
              <Text className="text-slate-400 text-sm leading-6 mb-5">
                A {MEAL_PLAN.DURATION_DAYS}-day plan built around your calorie target, dietary pattern, and allergies. Macros are computed from a food database, not guessed.
              </Text>

              <Button
                label={trial.status === "expired" ? "Upgrade to generate" : "Generate meal plan"}
                onPress={handleGenerate}
                fullWidth
              />

              <TouchableOpacity
                className="flex-row items-center justify-center mt-3"
                onPress={() => router.push("/(tabs)/profile" as Href)}
              >
                <Text className="text-slate-500 text-xs">
                  Dietary preferences & allergies are managed in{" "}
                  <Text className="text-brand-400">Settings</Text>
                </Text>
              </TouchableOpacity>

              {savedPlans.length > 0 && (
                <View className="mt-8">
                  <Text className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">
                    Saved plans
                  </Text>
                  <Card>
                    {savedPlans.map((sp, i) => (
                      <TouchableOpacity
                        key={sp.id}
                        className={`flex-row items-center py-2.5 ${i > 0 ? "border-t border-surface-border" : ""}`}
                        onPress={() => openSaved(sp)}
                        onLongPress={() => handleDeleteSaved(sp)}
                        activeOpacity={0.7}
                      >
                        <View className="flex-1 mr-3">
                          <Text className="text-white font-medium" numberOfLines={1}>{sp.name}</Text>
                          <Text className="text-slate-500 text-xs mt-0.5">
                            {sp.plan?.durationDays ?? sp.plan?.days?.length ?? 0} days
                            {sp.target_calories ? ` · ${sp.target_calories} kcal/day` : ""}
                            {" · "}
                            {new Date(sp.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.text.muted} style={{ marginRight: 8 }} />
                        <TouchableOpacity onPress={() => handleDeleteSaved(sp)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="trash-outline" size={18} color={colors.text.muted} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </Card>
                </View>
              )}
            </View>
          )}
        </KeyboardAwareScreen>
      </SafeAreaView>
    </SwipeBackGesture>
  );
}
