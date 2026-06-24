import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useWorkoutStore } from "@/stores/workoutStore";
import {
  useCreateWorkoutSession,
  useCompleteWorkoutSession,
  useLogWorkoutSet,
  useDeleteWorkoutSession,
  useWorkoutTemplates,
} from "@/hooks/useWorkouts";
import { publishActivityFeedItem, getExercisesByIds } from "@/lib/api";
import { isOnline } from "@/lib/network";
import { useOfflineStore } from "@/stores/offlineStore";
import type { Exercise, WorkoutSession } from "@/types";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { AppTextInput } from "@/components/AppTextInput";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { FinishWorkoutModal } from "@/components/FinishWorkoutModal";
import { colors } from "@/lib/theme";
import { ExercisePicker } from "@/components/ExercisePicker";
import { scrollInputIntoView } from "@/lib/scrollInputIntoView";

const ADD_EXERCISE_FOOTER_HEIGHT = 72;

function ElapsedTimer({ startedAt }: { startedAt: Date }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return (
    <Text className="text-brand-400 font-bold text-2xl">
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </Text>
  );
}

function buildExerciseBlocks(
  templateExercises: Array<{
    exercise_id: string;
    order: number;
    sets: Array<{ target_reps: number | null; target_weight_kg: number | null }>;
  }>,
  exerciseMap: Map<string, Exercise>
) {
  return templateExercises
    .sort((a, b) => a.order - b.order)
    .flatMap((te) => {
      const exercise = exerciseMap.get(te.exercise_id);
      if (!exercise) return [];

      const setCount = Math.max(1, te.sets?.length ?? 1);
      const sets = Array.from({ length: setCount }, (_, i) => {
        const templateSet = te.sets?.[i];
        return {
          exercise,
          setNumber: i + 1,
          reps: templateSet?.target_reps ?? null,
          weight_kg: templateSet?.target_weight_kg ?? null,
          rpe: null,
          is_warmup: false,
          completed: false,
        };
      });

      return [{ exercise, sets }];
    });
}

export default function WorkoutSessionScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const {
    activeSession,
    activeExercises,
    startedAt,
    startSession,
    addExercise,
    completeSet,
    addSet,
    endSession,
  } = useWorkoutStore();

  const refreshKeys = useMemo(
    () => [["workout-templates"], ["exercises"], ["workout-sessions"]] as const,
    []
  );
  const { refreshing, onRefresh } = useScreenRefresh([...refreshKeys]);

  const createSession = useCreateWorkoutSession();
  const completeSession = useCompleteWorkoutSession();
  const deleteSession = useDeleteWorkoutSession();
  const logSet = useLogWorkoutSet();
  const { data: templates = [], isLoading: templatesLoading } = useWorkoutTemplates();
  const queueWorkoutSession = useOfflineStore((s) => s.queueWorkoutSession);

  const [exerciseQuery, setExerciseQuery] = useState("");
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const initializedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { keyboardHeight } = useKeyboardInset(!showExercisePicker);

  const scrollBottomPadding = Math.max(insets.bottom, 16) + ADD_EXERCISE_FOOTER_HEIGHT;

  useEffect(() => {
    if (initializedRef.current) return;
    if (templateId && templatesLoading) return;

    initializedRef.current = true;
    let cancelled = false;

    async function init() {
      endSession();
      const template = templateId ? templates.find((t) => t.id === templateId) : null;

      try {
        const online = await isOnline();
        let session: WorkoutSession;

        if (online) {
          session = await createSession.mutateAsync({
            template_id: template?.id ?? null,
            name: template?.name ?? "Quick Workout",
            started_at: new Date().toISOString(),
            completed_at: null,
            duration_seconds: null,
            notes: null,
            is_synced: true,
          });
        } else {
          session = {
            id: `local_${Date.now()}`,
            user_id: "offline",
            template_id: template?.id ?? null,
            name: template?.name ?? "Quick Workout",
            started_at: new Date().toISOString(),
            completed_at: null,
            duration_seconds: null,
            notes: null,
            is_synced: false,
          };
        }

        let blocks: ReturnType<typeof buildExerciseBlocks> = [];
        if (template?.exercises?.length) {
          const ids = template.exercises.map((e) => e.exercise_id);
          const exercises = await getExercisesByIds(ids);
          const map = new Map(exercises.map((e) => [e.id, e]));
          blocks = buildExerciseBlocks(template.exercises, map);
        }

        if (!cancelled) {
          startSession(session, blocks);
          setIsInitializing(false);
        }
      } catch {
        initializedRef.current = false;
        if (!cancelled) {
          Alert.alert("Error", "Could not start workout session.");
          router.back();
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates, templatesLoading]);

  function handleFinish() {
    if (!activeSession || !startedAt) return;
    setShowFinishModal(true);
  }

  async function confirmFinish(shareToFeed: boolean) {
    if (!activeSession || !startedAt) return;

    setIsFinishing(true);
    try {
      const durationSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const completedAt = new Date().toISOString();
      const online = await isOnline();
      const isLocalSession = activeSession.id.startsWith("local_");

      const pending_sets = activeExercises.flatMap((block) =>
        block.sets
          .filter((set) => set.completed)
          .map((set, index) => ({
            exercise_id: block.exercise.id,
            set_number: index + 1,
            reps: set.reps,
            weight_kg: set.weight_kg,
            duration_seconds: null,
            distance_meters: null,
            rpe: set.rpe,
            is_warmup: set.is_warmup,
            completed_at: completedAt,
          }))
      );

      if (!online || isLocalSession) {
        queueWorkoutSession(
          {
            template_id: activeSession.template_id,
            name: activeSession.name,
            started_at: activeSession.started_at,
            completed_at: completedAt,
            duration_seconds: durationSeconds,
            notes: activeSession.notes,
            is_synced: false,
          },
          pending_sets,
          { shareToFeed }
        );

        Alert.alert(
          "Saved offline",
          shareToFeed
            ? "Your workout will sync and appear in friends' feeds when you're back online."
            : "Your workout will sync automatically when you're back online."
        );
      } else {
        await completeSession.mutateAsync({
          sessionId: activeSession.id,
          updates: {
            completed_at: completedAt,
            duration_seconds: durationSeconds,
          },
        });

        if (shareToFeed) {
          await publishActivityFeedItem(
            "workout_completed",
            activeSession.id,
            {
              workout_name: activeSession.name,
              duration_seconds: durationSeconds,
              exercise_count: activeExercises.length,
              set_count: pending_sets.length,
            }
          );
        }
      }

      setShowFinishModal(false);
      endSession();
      router.back();
    } catch {
      Alert.alert("Error", "Could not save your workout. Please try again.");
    } finally {
      setIsFinishing(false);
    }
  }

  async function handleCompleteSet(
    exerciseIdx: number,
    setIdx: number,
    reps: number,
    weight_kg: number
  ) {
    if (!activeSession) return;

    const exercise = activeExercises[exerciseIdx].exercise;
    completeSet(exerciseIdx, setIdx, { reps, weight_kg, completed: true });

    const online = await isOnline();
    if (!online || activeSession.id.startsWith("local_")) return;

    await logSet.mutateAsync({
      session_id: activeSession.id,
      exercise_id: exercise.id,
      set_number: setIdx + 1,
      reps,
      weight_kg,
      duration_seconds: null,
      distance_meters: null,
      rpe: null,
      is_warmup: false,
      completed_at: new Date().toISOString(),
    });
  }

  if (isInitializing) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size="large" color={colors.brand[500]} />
        <Text className="text-slate-400 mt-3">Starting workout…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SwipeBackGesture>
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <TouchableOpacity
          className="bg-surface-elevated rounded-lg px-3 py-2"
          onPress={() => {
            Alert.alert("Discard Workout?", "Your session will not be saved.", [
              { text: "Keep Going", style: "cancel" },
              {
                text: "Discard",
                style: "destructive",
                onPress: async () => {
                  if (activeSession && !activeSession.id.startsWith("local_")) {
                    await deleteSession.mutateAsync(activeSession.id);
                  }
                  endSession();
                  router.back();
                },
              },
            ]);
          }}
        >
          <Text className="text-slate-400 text-sm">Cancel</Text>
        </TouchableOpacity>
        <View className="flex-row items-center gap-2">
          {startedAt && <ElapsedTimer startedAt={startedAt} />}
        </View>
        <TouchableOpacity
          className="bg-green-500 rounded-lg px-4 py-2"
          onPress={handleFinish}
        >
          <Text className="text-white font-semibold text-sm">Finish</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-1">
      <ScrollView
        ref={scrollRef}
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
        }
      >
        {/* Exercise blocks */}
        {activeExercises.map((block, exIdx) => (
          <View key={`${block.exercise.id}-${exIdx}`} className="bg-surface-card rounded-2xl p-4 mb-4">
            <Text className="text-white font-bold text-base mb-3">{block.exercise.name}</Text>

            {/* Set rows */}
            <View className="mb-2">
              <View className="flex-row gap-2 mb-2">
                <Text className="text-slate-500 text-xs w-8">Set</Text>
                <Text className="text-slate-500 text-xs flex-1 text-center">Reps</Text>
                <Text className="text-slate-500 text-xs flex-1 text-center">Weight (kg)</Text>
                <View className="w-16" />
              </View>

              {block.sets.map((set, setIdx) => (
                <SetRow
                  key={setIdx}
                  setNumber={setIdx + 1}
                  defaultReps={set.reps}
                  defaultWeight={set.weight_kg}
                  completed={set.completed}
                  onInputFocus={(target) => scrollInputIntoView(scrollRef, target)}
                  onComplete={(reps, weight) =>
                    handleCompleteSet(exIdx, setIdx, reps, weight)
                  }
                />
              ))}
            </View>

            <TouchableOpacity
              className="border border-dashed border-surface-elevated rounded-xl py-2.5 items-center mt-1"
              onPress={() => addSet(exIdx)}
            >
              <Text className="text-slate-400 text-sm">+ Add Set</Text>
            </TouchableOpacity>
          </View>
        ))}

      </ScrollView>

      {keyboardHeight === 0 && (
        <View className="px-5" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <TouchableOpacity
            className="border-2 border-dashed border-surface-elevated rounded-2xl py-4 items-center"
            onPress={() => setShowExercisePicker(true)}
          >
            <Text className="text-brand-400 font-medium">+ Add Exercise</Text>
          </TouchableOpacity>
        </View>
      )}
      </View>

      <FinishWorkoutModal
        visible={showFinishModal}
        workoutName={activeSession?.name ?? "Workout"}
        saving={isFinishing}
        onClose={() => setShowFinishModal(false)}
        onFinish={confirmFinish}
      />

      <ExercisePicker
        visible={showExercisePicker}
        query={exerciseQuery}
        onQueryChange={setExerciseQuery}
        onSelect={(exercise) => {
          const added = addExercise(exercise);
          if (!added) {
            Alert.alert("Already added", `${exercise.name} is already in this workout.`);
            return;
          }
          setShowExercisePicker(false);
          setExerciseQuery("");
        }}
        onClose={() => {
          setShowExercisePicker(false);
          setExerciseQuery("");
        }}
      />
    </SafeAreaView>
    </SwipeBackGesture>
  );
}

function SetRow({
  setNumber,
  defaultReps,
  defaultWeight,
  completed,
  onInputFocus,
  onComplete,
}: {
  setNumber: number;
  defaultReps: number | null;
  defaultWeight: number | null;
  completed: boolean;
  onInputFocus: (target: number) => void;
  onComplete: (reps: number, weight: number) => void;
}) {
  const [reps, setReps] = useState(String(defaultReps ?? ""));
  const [weight, setWeight] = useState(String(defaultWeight ?? ""));

  return (
    <View
      className={`flex-row gap-2 items-center py-2 rounded-lg mb-1 px-1 ${
        completed ? "bg-green-500/10" : ""
      }`}
    >
      <Text className={`text-sm w-8 text-center ${completed ? "text-green-400" : "text-slate-400"}`}>
        {setNumber}
      </Text>
      <AppTextInput
        className="flex-1 bg-surface-elevated text-white rounded-lg text-center"
        variant="compact"
        placeholder="0"
        keyboardType="number-pad"
        value={reps}
        onChangeText={setReps}
        editable={!completed}
        onFocus={(event) => onInputFocus(event.nativeEvent.target)}
      />
      <AppTextInput
        className="flex-1 bg-surface-elevated text-white rounded-lg text-center"
        variant="compact"
        placeholder="0"
        keyboardType="decimal-pad"
        value={weight}
        onChangeText={setWeight}
        editable={!completed}
        onFocus={(event) => onInputFocus(event.nativeEvent.target)}
      />
      <TouchableOpacity
        className={`w-16 py-2 rounded-lg items-center ${
          completed ? "bg-green-500/30" : "bg-brand-500"
        }`}
        onPress={() => {
          if (completed) return;
          onComplete(parseInt(reps) || 0, parseFloat(weight) || 0);
        }}
        disabled={completed}
      >
        <Text className={`text-sm font-semibold ${completed ? "text-green-400" : "text-white"}`}>
          {completed ? "✓" : "Done"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
