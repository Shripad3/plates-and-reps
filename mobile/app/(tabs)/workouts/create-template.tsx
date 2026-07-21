import { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  useCreateWorkoutTemplate,
  useUpdateWorkoutTemplate,
  useWorkoutTemplates,
} from "@/hooks/useWorkouts";
import type { Exercise } from "@/types";
import { getExercisesByIds } from "@/lib/api";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { AppTextInput } from "@/components/AppTextInput";
import { ExercisePicker } from "@/components/ExercisePicker";
import { colors } from "@/lib/theme";

interface TemplateExercise {
  exercise: Exercise;
  sets: number;
  targetReps: string;
}

const ADD_EXERCISE_FOOTER_HEIGHT = 72;

export default function CreateTemplateScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const isEditing = !!templateId;
  const { data: templates = [] } = useWorkoutTemplates();
  const existing = templates.find((t) => t.id === templateId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const tabBarPadding = useTabBarScrollPadding();

  const refreshKeys = useMemo(() => [["exercises"]] as const, []);
  const { refreshing, onRefresh } = useScreenRefresh([...refreshKeys]);

  const createTemplate = useCreateWorkoutTemplate();
  const updateTemplate = useUpdateWorkoutTemplate();

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setDescription(existing.description ?? "");

    let cancelled = false;
    (async () => {
      // Prefer the exercise object embedded in the template; fall back to
      // looking any missing ones up by id (e.g. seed routines store only ids).
      const byId = new Map<string, Exercise>();
      existing.exercises.forEach((e) => {
        if (e.exercise) byId.set(e.exercise_id, e.exercise);
      });
      const missingIds = existing.exercises
        .map((e) => e.exercise_id)
        .filter((id) => id && !byId.has(id));
      if (missingIds.length > 0) {
        try {
          const fetched = await getExercisesByIds(missingIds);
          fetched.forEach((ex) => byId.set(ex.id, ex));
        } catch {
          // ignore — any exercise without a resolvable definition is skipped
        }
      }
      if (cancelled) return;
      setExercises(
        existing.exercises
          .map((e) => {
            const exercise = e.exercise ?? byId.get(e.exercise_id);
            if (!exercise) return null;
            return {
              exercise,
              sets: e.sets.length,
              targetReps: String(e.sets[0]?.target_reps ?? 10),
            };
          })
          .filter((item): item is TemplateExercise => item !== null)
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [existing?.id]);

  const scrollBottomPadding = tabBarPadding + ADD_EXERCISE_FOOTER_HEIGHT;

  function addExercise(ex: Exercise) {
    if (exercises.some((item) => item.exercise.id === ex.id)) {
      Alert.alert("Already added", `${ex.name} is already in this routine.`);
      return;
    }

    setExercises((prev) => [...prev, { exercise: ex, sets: 3, targetReps: "10" }]);
    setShowPicker(false);
    setExerciseQuery("");
  }


  function closePicker() {
    setShowPicker(false);
    setExerciseQuery("");
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a routine name.");
      return;
    }
    if (exercises.length === 0) {
      Alert.alert("Error", "Add at least one exercise.");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      exercises: exercises.map((e, idx) => ({
        exercise_id: e.exercise.id,
        order: idx,
        exercise: e.exercise,
        sets: Array.from({ length: e.sets }, () => ({
          target_reps: parseInt(e.targetReps) || null,
          target_weight_kg: null,
          rest_seconds: 60,
        })),
      })),
    };

    try {
      if (isEditing && templateId) {
        await updateTemplate.mutateAsync({ id: templateId, updates: payload });
      } else {
        await createTemplate.mutateAsync({
          user_id: "",
          is_public: false,
          ...payload,
        });
      }
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", (err as Error).message);
    }
  }

  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-brand-400 text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold">
            {isEditing ? "Edit Routine" : "New Routine"}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={createTemplate.isPending || updateTemplate.isPending}
          >
            <Text className="text-brand-400 font-semibold text-sm">
              {createTemplate.isPending || updateTemplate.isPending ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="flex-1">
        <DraggableFlatList
            data={exercises}
            keyExtractor={(item) => item.exercise.id}
            onDragEnd={({ data }) => setExercises(data)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollBottomPadding }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
            }
            ListHeaderComponent={
              <View>
                <View className="mb-4">
                  <Text className="text-slate-400 text-sm mb-1.5">Routine Name</Text>
                  <AppTextInput
                    placeholder="e.g. Push Day"
                    placeholderTextColor={colors.text.muted}
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <View className="mb-5">
                  <Text className="text-slate-400 text-sm mb-1.5">Description (optional)</Text>
                  <AppTextInput
                    placeholder="Notes about this routine"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                  />
                </View>

                <Text className="text-white font-semibold text-base mb-3">Exercises</Text>
              </View>
            }
            ListEmptyComponent={
              <Text className="text-slate-500 text-sm mb-2">
                No exercises yet. Tap “Add Exercise” below to start.
              </Text>
            }
            ListFooterComponent={
              <TouchableOpacity
                className="border-2 border-dashed border-surface-elevated rounded-2xl py-4 items-center mt-2"
                onPress={() => setShowPicker(true)}
              >
                <Text className="text-brand-400 font-medium">+ Add Exercise</Text>
              </TouchableOpacity>
            }
            renderItem={({ item, drag, isActive }: RenderItemParams<TemplateExercise>) => {
              const exId = item.exercise.id;
              return (
                <ScaleDecorator>
                  <View className={`bg-surface-card rounded-xl p-4 mb-2 ${isActive ? "opacity-90" : ""}`}>
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center flex-1">
                        <TouchableOpacity
                          onLongPress={drag}
                          disabled={isActive}
                          delayLongPress={150}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          className="pr-2"
                        >
                          <Ionicons name="reorder-three-outline" size={22} color={colors.text.muted} />
                        </TouchableOpacity>
                        <Text className="text-white font-medium flex-1">{item.exercise.name}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          setExercises((prev) => prev.filter((e) => e.exercise.id !== exId))
                        }
                      >
                        <Text className="text-red-400 text-sm">Remove</Text>
                      </TouchableOpacity>
                    </View>
                    <View className="flex-row gap-4 items-center">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-slate-400 text-sm">Sets:</Text>
                        <TouchableOpacity
                          className="w-11 h-11 bg-surface-elevated rounded-lg items-center justify-center"
                          onPress={() =>
                            setExercises((prev) =>
                              prev.map((e) =>
                                e.exercise.id === exId ? { ...e, sets: Math.max(1, e.sets - 1) } : e
                              )
                            )
                          }
                        >
                          <Text className="text-white font-bold">−</Text>
                        </TouchableOpacity>
                        <Text className="text-white font-semibold w-4 text-center">{item.sets}</Text>
                        <TouchableOpacity
                          className="w-11 h-11 bg-surface-elevated rounded-lg items-center justify-center"
                          onPress={() =>
                            setExercises((prev) =>
                              prev.map((e) => (e.exercise.id === exId ? { ...e, sets: e.sets + 1 } : e))
                            )
                          }
                        >
                          <Text className="text-white font-bold">+</Text>
                        </TouchableOpacity>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Text className="text-slate-400 text-sm">Reps:</Text>
                        <AppTextInput
                          className="bg-surface-elevated text-white rounded-lg w-16 text-center"
                          variant="compact"
                          value={item.targetReps}
                          onChangeText={(v) =>
                            setExercises((prev) =>
                              prev.map((e) => (e.exercise.id === exId ? { ...e, targetReps: v } : e))
                            )
                          }
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                  </View>
                </ScaleDecorator>
              );
            }}
          />

        </View>

        <ExercisePicker
          visible={showPicker}
          query={exerciseQuery}
          onQueryChange={setExerciseQuery}
          onSelect={addExercise}
          onClose={closePicker}
        />
      </SafeAreaView>
    </SwipeBackGesture>
  );
}
