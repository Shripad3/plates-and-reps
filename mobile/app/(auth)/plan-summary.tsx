import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { getGoal, getProfile, getBodyMetrics } from "@/lib/api";
import { colors } from "@/lib/theme";
import { APP_AI_NAME } from "@/constants";
import { Card, Section, SectionTitle } from "@/components/ui/Card";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Button } from "@/components/ui/Button";
import { QuickWinCard } from "@/components/QuickWinCard";

const WEEKLY_RATE_KG: Record<string, number> = {
  weight_loss: 0.5,
  muscle_gain: 0.25,
};

const FEATURES: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}[] = [
  {
    icon: "camera-outline",
    title: "Snap a photo, log your food",
    description: `${APP_AI_NAME} recognizes meals from a photo or voice note — no manual search.`,
  },
  {
    icon: "sparkles-outline",
    title: "Your AI coach",
    description: "Ask questions and get guidance tailored to your goal, anytime.",
  },
  {
    icon: "barbell-outline",
    title: "Smart workout tracking",
    description: "Log sets and reps, build templates, and track strength over time.",
  },
  {
    icon: "people-outline",
    title: "Streaks & social feed",
    description: "Stay accountable with daily streaks and progress shared with friends.",
  },
];

export default function PlanSummaryScreen() {
  const { data: goal } = useQuery({ queryKey: ["goal"], queryFn: getGoal });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const { data: bodyMetrics } = useQuery({
    queryKey: ["body-metrics"],
    queryFn: () => getBodyMetrics(),
  });

  const calorieTarget = goal?.target_calories ?? 0;
  const waterTarget = goal?.target_water_ml ?? 0;
  const currentWeight = bodyMetrics?.[bodyMetrics.length - 1]?.weight_kg ?? null;
  const heightCm = profile?.height_cm ?? null;

  const bmi =
    currentWeight && heightCm ? currentWeight / (heightCm / 100) ** 2 : null;

  const weeklyRate = goal?.goal_type ? WEEKLY_RATE_KG[goal.goal_type] : undefined;
  const weightDelta =
    currentWeight && goal?.target_weight_kg ? goal.target_weight_kg - currentWeight : null;
  const weeksToGoal =
    weeklyRate && weightDelta && Math.abs(weightDelta) > 0.5
      ? Math.round(Math.abs(weightDelta) / weeklyRate)
      : null;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View className="px-6 pt-6 pb-2">
          <View className="flex-row items-center gap-1.5 mb-3">
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text className="text-brand-400 text-xs font-semibold uppercase tracking-wide">
              Plan ready
            </Text>
          </View>
          <Text className="text-white text-2xl font-bold mb-2">
            {profile?.display_name ? `${profile.display_name}, here's your plan` : "Here's your plan"}
          </Text>
          <Text className="text-slate-400">
            Built from your goal, stats, and activity level — and it adapts as you log.
          </Text>
        </View>

        <Section className="mt-4">
          <Card className="p-5">
            <Text className="text-slate-400 text-sm mb-1">Daily calorie target</Text>
            <View className="flex-row items-end mb-4">
              <Text className="text-white text-5xl font-bold tracking-tight">
                {calorieTarget}
              </Text>
              <Text className="text-slate-500 text-base ml-2 mb-1.5">kcal</Text>
            </View>

            <View className="flex-row pt-5 border-t border-surface-border">
              <ProgressRing
                label="Protein"
                value={`${goal?.target_protein_g ?? 0}g`}
                progress={100}
                color={colors.macro.protein}
                trackColor={colors.macro.track.protein}
              />
              <ProgressRing
                label="Carbs"
                value={`${goal?.target_carbs_g ?? 0}g`}
                progress={100}
                color={colors.macro.carbs}
                trackColor={colors.macro.track.carbs}
              />
              <ProgressRing
                label="Fat"
                value={`${goal?.target_fat_g ?? 0}g`}
                progress={100}
                color={colors.macro.fat}
                trackColor={colors.macro.track.fat}
              />
            </View>
          </Card>
        </Section>

        <Section className="mt-6">
          <View className="flex-row gap-3">
            <Card className="flex-1 flex-row items-center gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: `${colors.info}26` }}
              >
                <Ionicons name="water-outline" size={20} color={colors.info} />
              </View>
              <View>
                <Text className="text-white text-lg font-bold">
                  {(waterTarget / 1000).toFixed(1)}L
                </Text>
                <Text className="text-slate-400 text-xs">water / day</Text>
              </View>
            </Card>
            {bmi !== null && (
              <Card className="flex-1 flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-brand-500/12 items-center justify-center">
                  <Ionicons name="body-outline" size={20} color={colors.brand[400]} />
                </View>
                <View>
                  <Text className="text-white text-lg font-bold">{bmi.toFixed(1)}</Text>
                  <Text className="text-slate-400 text-xs">your BMI</Text>
                </View>
              </Card>
            )}
          </View>
        </Section>

        {weeksToGoal !== null && goal?.target_weight_kg && (
          <Section className="mt-4">
            <Card className="flex-row items-center gap-3 bg-brand-500/10 border-brand-500/30">
              <View className="w-10 h-10 rounded-xl bg-brand-500/20 items-center justify-center">
                <Ionicons name="flag-outline" size={20} color={colors.brand[400]} />
              </View>
              <Text className="flex-1 text-slate-200 text-sm leading-5">
                At a steady, healthy pace, you could reach{" "}
                <Text className="text-white font-semibold">{goal.target_weight_kg}kg</Text> in
                about <Text className="text-white font-semibold">{weeksToGoal} weeks</Text>.
              </Text>
            </Card>
          </Section>
        )}

        <QuickWinCard />

        <Section className="mt-7">
          <SectionTitle>What you unlock</SectionTitle>
          <View className="gap-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="flex-row items-start gap-3">
                <View className="w-9 h-9 rounded-lg bg-brand-500/12 items-center justify-center mt-0.5">
                  <Ionicons name={f.icon} size={18} color={colors.brand[400]} />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-medium text-sm mb-0.5">{f.title}</Text>
                  <Text className="text-slate-400 text-xs leading-4">{f.description}</Text>
                </View>
              </Card>
            ))}
          </View>
        </Section>

        <View className="px-6 mt-8">
          <Button
            label="Start tracking"
            onPress={() => router.replace("/(tabs)/home")}
            fullWidth
            size="lg"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
