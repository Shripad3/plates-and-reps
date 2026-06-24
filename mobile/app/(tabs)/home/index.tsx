import { useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router, type Href } from "expo-router";
import { TabSafeArea } from "@/components/TabSafeArea";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getProfile, getGoal, getStreaks } from "@/lib/api";
import { useDaySummary, useLogWater } from "@/hooks/useNutrition";
import { colors } from "@/lib/theme";
import { useWorkoutSessions } from "@/hooks/useWorkouts";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import { todayLocal } from "@/lib/dates";
import { Card, Section, SectionTitle } from "@/components/ui/Card";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { IconButton } from "@/components/ui/IconButton";
import { CoachHeaderButton } from "@/components/CoachHeaderButton";

const QUICK_ACTIONS = [
  { label: "Food", icon: "restaurant-outline" as const, href: "/(tabs)/nutrition" },
  { label: "Workout", icon: "barbell-outline" as const, href: "/workout-session" },
  { label: "Weight", icon: "scale-outline" as const, href: "/(tabs)/progress" },
];

export default function HomeScreen() {
  const today = todayLocal();
  const refreshKeys = useMemo(
    () => [
      ["profile"],
      ["goal"],
      ["streaks"],
      ["workout-sessions"],
      ["nutrition", today],
      ["water", today],
    ],
    [today]
  );
  const { refreshing, onRefresh } = useScreenRefresh(refreshKeys);
  useRefetchOnFocus(refreshKeys);
  const tabBarPadding = useTabBarScrollPadding();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });
  const { data: goal, isLoading: goalLoading } = useQuery({
    queryKey: ["goal"],
    queryFn: getGoal,
  });
  const { data: streaks = [], isLoading: streaksLoading } = useQuery({
    queryKey: ["streaks"],
    queryFn: getStreaks,
  });
  const { data: sessions = [], isLoading: sessionsLoading } = useWorkoutSessions();
  const { calories, protein_g, carbs_g, fat_g, water_ml, logs } = useDaySummary(today);
  const logWater = useLogWater();
  const isLoading = profileLoading || goalLoading || streaksLoading;

  const calorieTarget = goal?.target_calories ?? 2000;
  const caloriesRemaining = Math.max(calorieTarget - calories, 0);
  const caloriePct = Math.min((calories / calorieTarget) * 100, 100);
  const waterTarget = goal?.target_water_ml ?? 2500;
  const waterPct = Math.min((water_ml / waterTarget) * 100, 100);

  const loggingStreak = streaks.find((s) => s.streak_type === "logging")?.current_streak ?? 0;

  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 18
        ? "Good afternoon"
        : "Good evening";

  return (
    <TabSafeArea>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
        }
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-slate-400 text-sm">{greeting}</Text>
            <Text className="text-white text-2xl font-bold tracking-tight">
              {profile?.display_name ?? "Friend"}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <CoachHeaderButton />
            <IconButton
              icon="person-outline"
              onPress={() => router.push("/(tabs)/profile")}
              accessibilityLabel="Profile"
            />
          </View>
        </View>

        <Section className="mt-4">
          <Card className="p-5">
            <Text className="text-slate-400 text-sm mb-1">Calories today</Text>
            {isLoading && logs.length === 0 ? (
              <ActivityIndicator color={colors.brand[400]} className="py-6" />
            ) : (
              <>
                <View className="flex-row items-end mb-4">
                  <Text className="text-white text-5xl font-bold tracking-tight">
                    {Math.round(caloriesRemaining)}
                  </Text>
                  <Text className="text-slate-500 text-base ml-2 mb-1.5">kcal left</Text>
                </View>
                <View className="h-1.5 bg-surface-elevated rounded-full overflow-hidden mb-2">
                  <View
                    className="h-full bg-brand-500 rounded-full"
                    style={{ width: `${caloriePct}%` }}
                  />
                </View>
                <Text className="text-slate-500 text-sm">
                  {Math.round(calories)} of {calorieTarget} kcal consumed
                </Text>
              </>
            )}

            <View className="flex-row mt-5 pt-5 border-t border-surface-border">
              <ProgressRing
                label="Protein"
                value={`${Math.round(protein_g)}g`}
                progress={goal?.target_protein_g ? (protein_g / goal.target_protein_g) * 100 : 0}
                color={colors.macro.protein}
              />
              <ProgressRing
                label="Carbs"
                value={`${Math.round(carbs_g)}g`}
                progress={goal?.target_carbs_g ? (carbs_g / goal.target_carbs_g) * 100 : 0}
                color={colors.macro.carbs}
              />
              <ProgressRing
                label="Fat"
                value={`${Math.round(fat_g)}g`}
                progress={goal?.target_fat_g ? (fat_g / goal.target_fat_g) * 100 : 0}
                color={colors.macro.fat}
              />
            </View>
          </Card>
        </Section>

        <Section className="mt-6">
          <SectionTitle>Quick log</SectionTitle>
          <View className="flex-row gap-3">
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.label}
                className="flex-1 bg-surface-card border border-surface-border rounded-xl p-4 items-center gap-2"
                onPress={() => router.push(action.href as Href)}
                activeOpacity={0.75}
              >
                <View className="w-10 h-10 rounded-xl bg-brand-500/12 items-center justify-center">
                  <Ionicons name={action.icon} size={20} color={colors.brand[400]} />
                </View>
                <Text className="text-white text-xs font-medium">{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        <Section className="mt-6">
          <View className="flex-row gap-3">
            <Card className="flex-1 flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-brand-500/12 items-center justify-center">
                <Ionicons name="flame-outline" size={20} color={colors.brand[400]} />
              </View>
              <View>
                <Text className="text-white text-2xl font-bold">{loggingStreak}</Text>
                <Text className="text-slate-400 text-xs">day streak</Text>
              </View>
            </Card>
            <Card className="flex-1">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-white font-medium text-sm">Water</Text>
                <Text className="text-slate-400 text-xs">
                  {Math.round(water_ml / 100) / 10}L / {waterTarget / 1000}L
                </Text>
              </View>
              <View className="h-1.5 bg-surface-elevated rounded-full overflow-hidden mb-3">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${waterPct}%`, backgroundColor: colors.info }}
                />
              </View>
              <View className="flex-row gap-2">
                {[250, 500].map((ml) => (
                  <TouchableOpacity
                    key={ml}
                    className="bg-surface-elevated rounded-lg px-2.5 py-1"
                    onPress={() => logWater.mutate({ date: today, amount_ml: ml })}
                  >
                    <Text className="text-slate-300 text-xs font-medium">+{ml}ml</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          </View>
        </Section>

        {sessionsLoading ? (
          <ActivityIndicator color={colors.brand[400]} className="mt-6" />
        ) : sessions.length > 0 ? (
          <Section className="mt-6 mb-8">
            <SectionTitle>Recent workouts</SectionTitle>
            {sessions.slice(0, 3).map((s) => (
              <TouchableOpacity
                key={s.id}
                className="bg-surface-card border border-surface-border rounded-xl p-4 mb-2 flex-row items-center justify-between"
                onPress={() =>
                  router.push(`/(tabs)/workouts/session-detail?id=${s.id}` as Href)
                }
                activeOpacity={0.75}
              >
                <View className="flex-1 mr-3">
                  <Text className="text-white font-medium">{s.name}</Text>
                  <Text className="text-slate-400 text-sm mt-0.5">
                    {new Date(s.started_at).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {s.duration_seconds ? ` · ${Math.round(s.duration_seconds / 60)} min` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
              </TouchableOpacity>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </TabSafeArea>
  );
}
