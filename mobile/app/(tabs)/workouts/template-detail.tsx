import { useMemo } from "react";
import { ScrollView, View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useWorkoutTemplates } from "@/hooks/useWorkouts";
import { getExercisesByIds } from "@/lib/api";
import type { Exercise } from "@/types";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { Button } from "@/components/ui/Button";
import { TemplateExercisesSkeleton } from "@/components/skeletons/WorkoutDetailSkeleton";

export default function TemplateDetailScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const insets = useSafeAreaInsets();

  const { data: templates = [] } = useWorkoutTemplates();
  const template = templates.find((t) => t.id === templateId);

  const exerciseIds = useMemo(
    () => (template?.exercises ?? []).map((e) => e.exercise_id).filter(Boolean),
    [template]
  );

  const { data: fetchedExercises = [], isLoading } = useQuery({
    queryKey: ["exercises-by-ids", exerciseIds],
    queryFn: () => getExercisesByIds(exerciseIds),
    enabled: exerciseIds.length > 0,
  });

  // Prefer the exercise object embedded in the template; fall back to fetched
  // definitions (seed routines store only exercise_id).
  const byId = useMemo(() => {
    const map = new Map<string, Exercise>();
    (template?.exercises ?? []).forEach((e) => {
      if (e.exercise) map.set(e.exercise_id, e.exercise);
    });
    fetchedExercises.forEach((ex) => map.set(ex.id, ex));
    return map;
  }, [template, fetchedExercises]);

  function startWorkout() {
    if (!templateId) return;
    router.push({ pathname: "/workout-session", params: { templateId } });
  }

  function editRoutine() {
    if (!templateId) return;
    router.push({ pathname: "/(tabs)/workouts/create-template", params: { templateId } });
  }

  if (!template) {
    return (
      <SwipeBackGesture>
        <SafeAreaView className="flex-1 bg-surface">
          <ScreenHeader title="Routine" />
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-slate-400 text-center">Routine not found.</Text>
          </View>
        </SafeAreaView>
      </SwipeBackGesture>
    );
  }

  const exercises = template.exercises ?? [];

  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface">
        <ScreenHeader
          title={template.name}
          right={
            <TouchableOpacity onPress={editRoutine} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text className="text-brand-400 text-sm font-medium">Edit</Text>
            </TouchableOpacity>
          }
        />

        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {template.description ? (
            <Text className="text-slate-300 text-sm mb-1">{template.description}</Text>
          ) : null}
          <Text className="text-slate-500 text-xs mb-4">
            {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
          </Text>

          {isLoading ? (
            <TemplateExercisesSkeleton />
          ) : exercises.length === 0 ? (
            <Text className="text-slate-400 text-center py-8">No exercises in this routine.</Text>
          ) : (
            exercises.map((e, idx) => {
              const exercise = e.exercise ?? byId.get(e.exercise_id);
              const name = exercise?.name ?? "Exercise";
              const targetReps = e.sets[0]?.target_reps;
              const targetWeight = e.sets[0]?.target_weight_kg;
              return (
                <View key={`${e.exercise_id}-${idx}`} className="bg-surface-card rounded-xl p-4 mb-3">
                  <Text className="text-white font-semibold text-base mb-1">{name}</Text>
                  <Text className="text-slate-400 text-sm">
                    {e.sets.length} set{e.sets.length !== 1 ? "s" : ""}
                    {targetReps != null ? ` × ${targetReps} reps` : ""}
                    {targetWeight != null ? ` · ${targetWeight} kg` : ""}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>

        <View
          className="px-5 pt-2 border-t border-surface-border"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <Button label="Start workout" fullWidth onPress={startWorkout} />
        </View>
      </SafeAreaView>
    </SwipeBackGesture>
  );
}
