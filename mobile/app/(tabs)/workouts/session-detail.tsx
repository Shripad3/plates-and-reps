import { useMemo } from "react";
import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getSessionSets, getWorkoutSessionById } from "@/lib/api";
import type { WorkoutSet } from "@/types";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import {
  WorkoutSummarySkeleton,
  SessionExercisesSkeleton,
} from "@/components/skeletons/WorkoutDetailSkeleton";

function groupSetsByExercise(sets: WorkoutSet[]) {
  const map = new Map<string, { name: string; sets: WorkoutSet[] }>();
  for (const set of sets) {
    const name = set.exercise?.name ?? "Exercise";
    const entry = map.get(set.exercise_id) ?? { name, sets: [] };
    entry.sets.push(set);
    map.set(set.exercise_id, entry);
  }
  return [...map.values()];
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tabBarPadding = useTabBarScrollPadding();

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["workout-session", id],
    queryFn: () => getWorkoutSessionById(id!),
    enabled: !!id,
  });

  const { data: sets = [], isLoading: setsLoading } = useQuery({
    queryKey: ["session-sets", id],
    queryFn: () => getSessionSets(id!),
    enabled: !!id,
  });

  const exercises = useMemo(() => groupSetsByExercise(sets), [sets]);
  const totalVolume = useMemo(
    () =>
      sets.reduce((sum, set) => sum + (set.weight_kg ?? 0) * (set.reps ?? 0), 0),
    [sets]
  );
  const isLoading = sessionLoading || setsLoading;

  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface">
        <ScreenHeader title="Workout Summary" />
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: tabBarPadding }}>
          {sessionLoading ? (
            <WorkoutSummarySkeleton />
          ) : session ? (
            <View className="bg-surface-card rounded-2xl p-4 mb-4">
              <Text className="text-white text-xl font-bold">{session.name}</Text>
              <Text className="text-slate-400 text-sm mt-1">
                {new Date(session.started_at).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              {session.duration_seconds ? (
                <Text className="text-slate-400 text-sm mt-1">
                  Duration: {Math.round(session.duration_seconds / 60)} min
                </Text>
              ) : null}
              {exercises.length > 0 ? (
                <Text className="text-slate-400 text-sm mt-1">
                  {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
                  {sets.length > 0
                    ? ` · ${sets.length} set${sets.length !== 1 ? "s" : ""}`
                    : ""}
                  {totalVolume > 0 ? ` · ${Math.round(totalVolume)} kg volume` : ""}
                </Text>
              ) : null}
              {session.notes ? (
                <Text className="text-slate-300 text-sm mt-2">{session.notes}</Text>
              ) : null}
            </View>
          ) : (
            <Text className="text-slate-400 text-center py-8">Workout not found.</Text>
          )}

          {isLoading ? (
            <SessionExercisesSkeleton />
          ) : exercises.length === 0 ? (
            <Text className="text-slate-400 text-center py-8">No sets logged for this session.</Text>
          ) : (
            exercises.map((ex) => (
              <View key={ex.name} className="bg-surface-card rounded-xl p-4 mb-3">
                <Text className="text-white font-semibold text-base mb-3">{ex.name}</Text>
                <View className="flex-row gap-2 mb-2">
                  <Text className="text-slate-500 text-xs w-8">Set</Text>
                  <Text className="text-slate-500 text-xs flex-1 text-center">Reps</Text>
                  <Text className="text-slate-500 text-xs flex-1 text-center">Weight</Text>
                </View>
                {ex.sets.map((set) => (
                  <View key={set.id} className="flex-row gap-2 py-1.5">
                    <Text className="text-slate-400 text-sm w-8">{set.set_number}</Text>
                    <Text className="text-white text-sm flex-1 text-center">
                      {set.reps ?? "—"}
                    </Text>
                    <Text className="text-white text-sm flex-1 text-center">
                      {set.weight_kg != null ? `${set.weight_kg} kg` : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </SwipeBackGesture>
  );
}
