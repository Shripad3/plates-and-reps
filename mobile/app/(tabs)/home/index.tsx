import { useMemo, useState, useEffect, useRef } from "react";
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
import { useDaySummary } from "@/hooks/useNutrition";
import { colors, fontSize, radii } from "@/lib/theme";
import { useWorkoutSessions } from "@/hooks/useWorkouts";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import { todayLocal } from "@/lib/dates";
import { Card, Section, SectionTitle } from "@/components/ui/Card";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { IconButton } from "@/components/ui/IconButton";
import { CoachHeaderButton } from "@/components/CoachHeaderButton";
import { QuickWinCard } from "@/components/QuickWinCard";
import { WaterWidget } from "@/components/WaterWidget";

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
  const isLoading = profileLoading || goalLoading || streaksLoading;

  const calorieTarget = goal?.target_calories ?? 2000;
  const caloriesRemaining = calorieTarget - calories;
  const isOverBudget = caloriesRemaining < 0;
  const caloriePct = Math.min((calories / calorieTarget) * 100, 100);
  const waterTarget = goal?.target_water_ml ?? 2500;

  const loggingStreak = streaks.find((s) => s.streak_type === "logging")?.current_streak ?? 0;

  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 18
        ? "Good afternoon"
        : "Good evening";

  // Animated calorie countdown — springs from previous value to current on each update.
  const [displayCal, setDisplayCal] = useState(Math.round(Math.abs(caloriesRemaining)));
  const prevCalRef = useRef(caloriesRemaining);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  useEffect(() => {
    const from = prevCalRef.current;
    const to = caloriesRemaining;
    if (from === to) return;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const startTime = Date.now();
    const duration = 700;

    function tick() {
      const t = Math.min((Date.now() - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplayCal(Math.round(Math.abs(from + (to - from) * eased)));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevCalRef.current = to;
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [caloriesRemaining]);

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
        {/* ── Header ── */}
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text style={{ fontSize: fontSize.caption, color: colors.text.muted }}>{greeting}</Text>
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: colors.text.primary,
                letterSpacing: -0.5,
              }}
            >
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

        {/* ── Calorie hero card ── */}
        <Section className="mt-4">
          {/* variant="hero" → borderRadius 20 */}
          <Card variant="hero" className="p-5">
            <Text style={{ fontSize: fontSize.caption, color: colors.text.muted, marginBottom: 6 }}>
              Calories today
            </Text>
            {isLoading && logs.length === 0 ? (
              <ActivityIndicator color={colors.brand[400]} className="py-6" />
            ) : (
              <>
                <View className="flex-row items-end mb-3">
                  <Text
                    style={{
                      fontSize: 60,
                      fontWeight: "800",
                      letterSpacing: -2,
                      color: isOverBudget ? colors.danger : colors.text.primary,
                      lineHeight: 66,
                    }}
                  >
                    {displayCal}
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.label,
                      color: colors.text.muted,
                      marginLeft: 8,
                      marginBottom: 10,
                    }}
                  >
                    {isOverBudget ? "kcal over" : "kcal left"}
                  </Text>
                </View>

                <View className="h-1.5 bg-surface-elevated rounded-full overflow-hidden mb-3">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${caloriePct}%`,
                      backgroundColor: isOverBudget ? colors.danger : colors.brand[500],
                    }}
                  />
                </View>
                <Text style={{ fontSize: fontSize.caption, color: colors.text.muted }}>
                  {Math.round(calories)} of {calorieTarget} kcal consumed
                </Text>
              </>
            )}

            {/* Macro rings — semantic plate colors, visible track at 0% */}
            <View className="flex-row mt-5 pt-5 border-t border-surface-border">
              <ProgressRing
                label="Protein"
                value={`${Math.round(protein_g)}g`}
                progress={goal?.target_protein_g ? (protein_g / goal.target_protein_g) * 100 : 0}
                color={colors.macro.protein}
                trackColor={colors.macro.track.protein}
                animated
              />
              <ProgressRing
                label="Carbs"
                value={`${Math.round(carbs_g)}g`}
                progress={goal?.target_carbs_g ? (carbs_g / goal.target_carbs_g) * 100 : 0}
                color={colors.macro.carbs}
                trackColor={colors.macro.track.carbs}
                animated
              />
              <ProgressRing
                label="Fat"
                value={`${Math.round(fat_g)}g`}
                progress={goal?.target_fat_g ? (fat_g / goal.target_fat_g) * 100 : 0}
                color={colors.macro.fat}
                trackColor={colors.macro.track.fat}
                animated
              />
            </View>
          </Card>
        </Section>

        {/* ── First-use nudge ── */}
        {!isLoading && loggingStreak === 0 && logs.length === 0 && <QuickWinCard />}

        {/* ── Quick log tiles ── */}
        <Section className="mt-6">
          <SectionTitle>Quick log</SectionTitle>
          <View className="flex-row gap-3">
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.label}
                // variant="tile" → borderRadius 12
                style={{ borderRadius: radii.md, flex: 1 }}
                className="bg-surface-card border border-surface-border p-4 items-center gap-2"
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

        {/* ── Streak + Water tiles ── */}
        <Section className="mt-6">
          <View className="flex-row gap-3">
            {/* Streak tile */}
            <Card variant="tile" className="flex-1 flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-brand-500/12 items-center justify-center">
                <Ionicons name="flame-outline" size={20} color={colors.brand[400]} />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 36,
                    fontWeight: "800",
                    color: colors.text.primary,
                    letterSpacing: -1,
                    lineHeight: 40,
                  }}
                >
                  {loggingStreak}
                </Text>
                <Text style={{ fontSize: fontSize.caption, color: colors.text.muted, marginTop: 2 }}>
                  day streak
                </Text>
              </View>
            </Card>

            <WaterWidget
              date={today}
              water_ml={water_ml}
              target_ml={waterTarget}
              variant="tile"
            />
          </View>
        </Section>

        {/* ── Recent workouts (list-rows) ── */}
        {sessionsLoading ? (
          <ActivityIndicator color={colors.brand[400]} className="mt-6" />
        ) : sessions.length > 0 ? (
          <Section className="mt-6 mb-8">
            <SectionTitle>Recent workouts</SectionTitle>
            {sessions.slice(0, 3).map((s) => (
              <TouchableOpacity
                key={s.id}
                // variant="list-row" → borderRadius 8
                style={{ borderRadius: radii.sm }}
                className="bg-surface-card border border-surface-border p-4 mb-2 flex-row items-center justify-between"
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
                    {s.duration_seconds
                      ? ` · ${Math.round(s.duration_seconds / 60)} min`
                      : ""}
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
