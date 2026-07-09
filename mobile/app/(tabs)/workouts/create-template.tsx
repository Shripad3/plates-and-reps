import { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { AppTextInput } from "@/components/AppTextInput";
import { ExercisePicker } from "@/components/ExercisePicker";
import { scrollInputIntoView } from "@/lib/scrollInputIntoView";
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
  const { keyboardHeight } = useKeyboardInset(!showPicker);
  const scrollRef = useRef<ScrollView>(null);

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

  function removeExercise(idx: number) {
    setExercises((prev) => prev.filter((_, i) => i !== idx));
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
        <ScrollView
            ref={scrollRef}
            className="flex-1 px-5"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
            }
          >
            <View className="mb-4">
              <Text className="text-slate-400 text-sm mb-1.5">Routine Name</Text>
              <AppTextInput
                placeholder="e.g. Push Day"
                placeholderTextColor={colors.text.muted}
                value={name}
                onChangeText={setName}
                onFocus={(event) => scrollInputIntoView(scrollRef, event.nativeEvent.target)}
              />
            </View>

            <View className="mb-5">
              <Text className="text-slate-400 text-sm mb-1.5">Description (optional)</Text>
              <AppTextInput
                placeholder="Notes about this routine"
                value={description}
                onChangeText={setDescription}
                multiline
                onFocus={(event) => scrollInputIntoView(scrollRef, event.nativeEvent.target)}
              />
            </View>

            <Text className="text-white font-semibold text-base mb-3">Exercises</Text>
            {exercises.map((item, idx) => (
              <View key={`${item.exercise.id}-${idx}`} className="bg-surface-card rounded-xl p-4 mb-2">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-white font-medium flex-1">{item.exercise.name}</Text>
                  <TouchableOpacity onPress={() => removeExercise(idx)}>
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
                          prev.map((e, i) =>
                            i === idx ? { ...e, sets: Math.max(1, e.sets - 1) } : e
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
                          prev.map((e, i) => (i === idx ? { ...e, sets: e.sets + 1 } : e))
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
                          prev.map((e, i) => (i === idx ? { ...e, targetReps: v } : e))
                        )
                      }
                      keyboardType="number-pad"
                      onFocus={(event) => scrollInputIntoView(scrollRef, event.nativeEvent.target)}
                    />
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>

          {keyboardHeight === 0 && (
            <View className="px-5" style={{ paddingBottom: tabBarPadding }}>
              <TouchableOpacity
                className="border-2 border-dashed border-surface-elevated rounded-2xl py-4 items-center"
                onPress={() => setShowPicker(true)}
              >
                <Text className="text-brand-400 font-medium">+ Add Exercise</Text>
              </TouchableOpacity>
            </View>
          )}
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
