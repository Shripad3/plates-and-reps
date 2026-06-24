import { useMemo } from "react";
import { ScrollView, View, Text, TouchableOpacity, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TabSafeArea } from "@/components/TabSafeArea";
import { router, type Href } from "expo-router";
import { useWorkoutTemplates, useWorkoutSessions } from "@/hooks/useWorkouts";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/Button";
import { Section, SectionTitle } from "@/components/ui/Card";
import { colors } from "@/lib/theme";

export default function WorkoutsScreen() {
  const refreshKeys = useMemo(
    () => [["workout-templates"], ["workout-sessions"]],
    []
  );
  const { refreshing, onRefresh } = useScreenRefresh(refreshKeys);
  useRefetchOnFocus(refreshKeys);
  const tabBarPadding = useTabBarScrollPadding();

  const { data: templates = [] } = useWorkoutTemplates();
  const { data: sessions = [] } = useWorkoutSessions();

  function startFromTemplate(templateId: string) {
    router.push({ pathname: "/workout-session", params: { templateId } });
  }

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
          <Text className="text-white text-2xl font-bold tracking-tight">Train</Text>
          <Button
            label="Start"
            size="sm"
            onPress={() => router.push("/workout-session")}
          />
        </View>

        <Section className="mt-4">
          <TouchableOpacity
            className="bg-brand-500 rounded-xl p-5 flex-row items-center justify-between"
            onPress={() => router.push("/workout-session")}
            activeOpacity={0.85}
          >
            <View>
              <Text className="text-white text-lg font-bold">Quick start</Text>
              <Text className="text-white/80 text-sm mt-0.5">Begin an empty workout</Text>
            </View>
            <View className="w-10 h-10 rounded-xl bg-white/15 items-center justify-center">
              <Ionicons name="play" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        </Section>

        <Section className="mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <SectionTitle>My routines</SectionTitle>
            <View className="flex-row items-center gap-4 -mt-3">
              <TouchableOpacity onPress={() => router.push("/(tabs)/workouts/create-template")}>
                <Text className="text-brand-400 text-sm font-medium">New</Text>
              </TouchableOpacity>
              {templates.length > 0 && (
                <TouchableOpacity onPress={() => router.push("/(tabs)/workouts/templates")}>
                  <Text className="text-brand-400 text-sm">View all</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {templates.length === 0 ? (
            <EmptyState
              icon="list-outline"
              title="No routines yet"
              description="Create a routine to quickly start your favourite workouts."
              actionLabel="Create routine"
              onAction={() => router.push("/(tabs)/workouts/create-template")}
            />
          ) : (
            templates.slice(0, 4).map((t) => (
              <TouchableOpacity
                key={t.id}
                className="bg-surface-card border border-surface-border rounded-xl p-4 mb-2 flex-row items-center justify-between"
                onPress={() => startFromTemplate(t.id)}
                activeOpacity={0.75}
              >
                <View className="flex-1 mr-3">
                  <Text className="text-white font-medium">{t.name}</Text>
                  {t.description ? (
                    <Text className="text-slate-400 text-sm mt-0.5">{t.description}</Text>
                  ) : null}
                  <Text className="text-slate-500 text-xs mt-1">
                    {t.exercises.length} exercise{t.exercises.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Ionicons name="play-circle" size={28} color={colors.brand[400]} />
              </TouchableOpacity>
            ))
          )}
        </Section>

        <Section className="mt-6 mb-8">
          <SectionTitle>Recent history</SectionTitle>
          {sessions.length === 0 ? (
            <View className="bg-surface-card border border-surface-border rounded-xl p-4">
              <Text className="text-slate-400 text-sm">No workouts logged yet.</Text>
            </View>
          ) : (
            sessions.slice(0, 5).map((s) => (
              <TouchableOpacity
                key={s.id}
                className="bg-surface-card border border-surface-border rounded-xl p-4 mb-2"
                onPress={() =>
                  router.push(`/(tabs)/workouts/session-detail?id=${s.id}` as Href)
                }
                activeOpacity={0.75}
              >
                <View className="flex-row justify-between">
                  <Text className="text-white font-medium">{s.name}</Text>
                  {s.duration_seconds ? (
                    <Text className="text-slate-400 text-sm">
                      {Math.round(s.duration_seconds / 60)} min
                    </Text>
                  ) : null}
                </View>
                <Text className="text-slate-500 text-xs mt-1">
                  {new Date(s.started_at).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </Section>
      </ScrollView>
    </TabSafeArea>
  );
}
