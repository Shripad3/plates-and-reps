import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AiPlanSkeleton } from "@/components/skeletons/AiPlanSkeleton";
import { KeyboardAwareScreen } from "@/components/KeyboardAwareScreen";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile } from "@/lib/api";
import { AI_PLAN } from "@/constants";
import { colors } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppTextInput } from "@/components/AppTextInput";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { InjuryForm } from "@/components/InjuryForm";
import { navigateToPaywall } from "@/lib/navigateToPaywall";
import {
  generatePlan,
  savePlanAsRoutines,
  resolveTrialState,
  getAiTrialStartedAt,
  type GeneratedPlan,
  type GeneratePlanInput,
  type InjuryInfo,
} from "@/lib/aiPlan";

type Phase = "form" | "injury" | "loading" | "result";

function Selectable({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`rounded-full px-3.5 py-2 mr-2 mb-2 border ${
        active ? "bg-brand-500 border-brand-500" : "bg-surface-card border-surface-border"
      }`}
    >
      <Text className={`text-sm ${active ? "text-white font-medium" : "text-slate-300"}`}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AiPlanScreen() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const { data: trialStartedAt } = useQuery({
    queryKey: ["ai-trial", "workout"],
    queryFn: () => getAiTrialStartedAt("workout"),
  });

  const [phase, setPhase] = useState<Phase>("form");
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [saving, setSaving] = useState(false);

  const [goal, setGoal] = useState<string>(AI_PLAN.GOALS[0].value);
  const [experience, setExperience] = useState<string>(AI_PLAN.EXPERIENCE_LEVELS[0].value);
  const [equipment, setEquipment] = useState<string[]>(["Dumbbells"]);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [sessionMinutes, setSessionMinutes] = useState("45");

  const trial = useMemo(
    () => resolveTrialState(!!profile?.is_premium, trialStartedAt),
    [profile?.is_premium, trialStartedAt]
  );
  const injuryMissing = !profile?.injury_info;

  const baseInput = (): GeneratePlanInput => ({
    goal,
    experience_level: experience,
    equipment,
    days_per_week: daysPerWeek,
    session_minutes: Math.max(15, Math.min(180, parseInt(sessionMinutes) || 45)),
  });

  async function runGenerate(injury?: InjuryInfo) {
    setPhase("loading");
    const result = await generatePlan({ ...baseInput(), ...(injury ? { injury_info: injury } : {}) });

    if (result.ok) {
      setPlan(result.plan);
      setPhase("result");
      // trial may have just started server-side — refresh for the banner
      queryClient.invalidateQueries({ queryKey: ["ai-trial", "workout"] });
      return;
    }
    if (result.code === "INJURY_INFO_REQUIRED") {
      setPhase("injury");
      return;
    }
    if (result.code === "TRIAL_EXPIRED") {
      setPhase("form");
      Alert.alert("Trial ended", result.message, [
        { text: "Not now", style: "cancel" },
        { text: "Upgrade", onPress: navigateToPaywall },
      ]);
      return;
    }
    setPhase("form");
    Alert.alert("Couldn't generate", result.message);
  }

  async function handleAccept() {
    if (!plan) return;
    setSaving(true);
    try {
      const created = await savePlanAsRoutines(plan);
      await queryClient.invalidateQueries({ queryKey: ["workout-templates"] });
      Alert.alert(
        "Plan saved",
        `${created.length} routine${created.length !== 1 ? "s" : ""} added. You can run them from the Train tab.`,
        [{ text: "Great", onPress: () => router.back() }]
      );
    } catch (err) {
      Alert.alert("Save failed", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <View className="px-5 pt-2 pb-3 flex-row items-center justify-between border-b border-surface-border">
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-brand-400 text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-white font-semibold text-base">AI Plan</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAwareScreen
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        >
          {/* Trial banner */}
          {trial.status !== "premium" && (
            <Card className="mb-5">
              {trial.status === "not_started" && (
                <Text className="text-white text-sm">
                  ✨ Try it free for {AI_PLAN.TRIAL_DAYS} days. Your trial starts when you generate your first plan.
                </Text>
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
              <Text className="text-slate-400 text-sm mb-4">Building your plan…</Text>
              <AiPlanSkeleton />
            </View>
          )}

          {phase === "injury" && (
            <View>
              <Text className="text-white text-lg font-bold mb-1">Before we build your plan</Text>
              <Text className="text-slate-400 text-sm mb-5">
                Adding injury info helps us keep your plan safe. You can skip this.
              </Text>
              <InjuryForm
                saveLabel="Save & generate"
                onSubmit={(info) => runGenerate(info)}
                onSkip={() => runGenerate({ status: "skipped" })}
              />
            </View>
          )}

          {phase === "result" && plan && (
            <View>
              <Text className="text-white text-2xl font-bold tracking-tight">{plan.planName}</Text>
              <Text className="text-slate-400 text-sm mt-1 mb-4">
                {plan.durationWeeks} weeks · {plan.weeks[0]?.days.length ?? 0} days/week
              </Text>
              {plan.notes ? <Text className="text-slate-300 text-sm mb-4">{plan.notes}</Text> : null}

              {plan.weeks[0]?.days.map((day) => (
                <Card key={day.dayNumber} className="mb-3">
                  <Text className="text-white font-semibold mb-2">Day {day.dayNumber} · {day.focus}</Text>
                  {day.exercises.map((ex, i) => (
                    <View key={`${ex.exerciseId}-${i}`} className="flex-row justify-between py-1">
                      <Text className="text-slate-300 text-sm flex-1">{ex.name}</Text>
                      <Text className="text-slate-500 text-sm">
                        {ex.sets.length} × {ex.sets[0]?.reps ?? "—"}
                      </Text>
                    </View>
                  ))}
                </Card>
              ))}

              <Text className="text-slate-500 text-xs mb-4">
                Week 1 shown. Saving creates one routine per day; later weeks progress from these.
              </Text>

              <View className="gap-2">
                <Button label="Save as routines" onPress={handleAccept} loading={saving} fullWidth />
                <TouchableOpacity className="py-3 items-center" onPress={() => setPhase("form")} disabled={saving}>
                  <Text className="text-slate-400 text-sm">Start over</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {phase === "form" && (
            <View>
              <Text className="text-slate-400 text-sm mb-2">Goal</Text>
              <View className="flex-row flex-wrap mb-4">
                {AI_PLAN.GOALS.map((g) => (
                  <Selectable key={g.value} label={g.label} active={goal === g.value} onPress={() => setGoal(g.value)} />
                ))}
              </View>

              <Text className="text-slate-400 text-sm mb-2">Experience</Text>
              <View className="flex-row flex-wrap mb-4">
                {AI_PLAN.EXPERIENCE_LEVELS.map((e) => (
                  <Selectable key={e.value} label={e.label} active={experience === e.value} onPress={() => setExperience(e.value)} />
                ))}
              </View>

              <Text className="text-slate-400 text-sm mb-2">Equipment</Text>
              <View className="flex-row flex-wrap mb-4">
                {AI_PLAN.EQUIPMENT.map((eq) => (
                  <Selectable
                    key={eq}
                    label={eq}
                    active={equipment.includes(eq)}
                    onPress={() =>
                      setEquipment((prev) => (prev.includes(eq) ? prev.filter((x) => x !== eq) : [...prev, eq]))
                    }
                  />
                ))}
              </View>

              <Text className="text-slate-400 text-sm mb-2">Days per week</Text>
              <View className="flex-row flex-wrap mb-4">
                {[2, 3, 4, 5, 6].map((d) => (
                  <Selectable key={d} label={`${d}`} active={daysPerWeek === d} onPress={() => setDaysPerWeek(d)} />
                ))}
              </View>

              <Text className="text-slate-400 text-sm mb-1.5">Session length (minutes)</Text>
              <AppTextInput
                value={sessionMinutes}
                onChangeText={setSessionMinutes}
                keyboardType="number-pad"
                placeholder="45"
                placeholderTextColor={colors.text.muted}
              />

              {injuryMissing && (
                <Text className="text-slate-500 text-xs mt-3">
                  Tip: adding injury info (asked next) improves plan safety.
                </Text>
              )}

              <Button
                label={trial.status === "expired" ? "Upgrade to generate" : "Generate plan"}
                onPress={trial.status === "expired" ? navigateToPaywall : () => runGenerate()}
                fullWidth
                className="mt-6"
              />
            </View>
          )}
        </KeyboardAwareScreen>
      </SafeAreaView>
    </SwipeBackGesture>
  );
}
