import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  RefreshControl,
  InputAccessoryView,
  Keyboard,
  Platform,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WorkoutSessionSkeleton } from "@/components/skeletons/WorkoutSessionSkeleton";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useWorkoutStore, makeSetId, type ActiveExerciseBlock } from "@/stores/workoutStore";
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
import { AppTextInput } from "@/components/AppTextInput";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { FinishWorkoutModal } from "@/components/FinishWorkoutModal";
import { colors } from "@/lib/theme";
import { ExercisePicker } from "@/components/ExercisePicker";

const ADD_EXERCISE_FOOTER_HEIGHT = 72;

// iOS-only "Done" bar above the number keyboards (number-pad has no return key).
const KEYBOARD_ACCESSORY_ID = "workout-set-input-accessory";

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
  // Copy before sorting — .sort() mutates in place, and templateExercises is the
  // cached base routine's array. Sorting it directly would reorder the template.
  return [...templateExercises]
    .sort((a, b) => a.order - b.order)
    .flatMap((te) => {
      const exercise = exerciseMap.get(te.exercise_id);
      if (!exercise) return [];

      const setCount = Math.max(1, te.sets?.length ?? 1);
      const sets = Array.from({ length: setCount }, (_, i) => {
        const templateSet = te.sets?.[i];
        return {
          id: makeSetId(),
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
    removeExercise,
    completeSet,
    updateSet,
    addSet,
    removeSet,
    reorderExercises,
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
  const finalizedRef = useRef(false);
  const deleteSessionRef = useRef(deleteSession.mutate);
  deleteSessionRef.current = deleteSession.mutate;
  const insets = useSafeAreaInsets();

  const scrollBottomPadding = Math.max(insets.bottom, 16) + ADD_EXERCISE_FOOTER_HEIGHT;

  useEffect(() => {
    if (initializedRef.current) return;
    // Wait for the templates query to settle before initializing — on ALL
    // paths, not just the templateId one. Starting init() while the query is
    // still loading means it flips templatesLoading/templates mid-flight, which
    // re-runs this effect, cancels the in-flight init, and leaves the screen
    // stuck on the loading skeleton (infinite buffer on first cold launch).
    if (templatesLoading) return;

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
    // `templates` is intentionally omitted: init() reads it once when
    // templatesLoading becomes false, and we must NOT let a later templates
    // refetch re-run this effect and cancel an in-flight init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templatesLoading]);

  // Discard the session if the screen is left any way other than
  // explicit Finish/Discard (e.g. swipe-back, hardware back button),
  // so abandoned sessions don't linger as empty "Quick Workout" entries.
  useEffect(() => {
    return () => {
      if (finalizedRef.current) return;
      const session = useWorkoutStore.getState().activeSession;
      if (session && !session.id.startsWith("local_")) {
        deleteSessionRef.current(session.id);
      }
      useWorkoutStore.getState().endSession();
    };
  }, []);

  function handleFinish() {
    if (!activeSession || !startedAt) return;
    setShowFinishModal(true);
  }

  function confirmDiscard() {
    Alert.alert("Discard Workout?", "Your session will not be saved.", [
      { text: "Keep Going", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          finalizedRef.current = true;
          if (activeSession && !activeSession.id.startsWith("local_")) {
            await deleteSession.mutateAsync(activeSession.id);
          }
          endSession();
          router.back();
        },
      },
    ]);
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

      finalizedRef.current = true;
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

  // Persist an edited value without marking the set complete — keeps fields editable.
  function handleCommitSet(exerciseIdx: number, setIdx: number, reps: number, weight_kg: number) {
    updateSet(exerciseIdx, setIdx, { reps, weight_kg });
  }

  // Session-only removal — confirms, then drops the exercise from this workout's copy.
  function handleRemoveExercise(exerciseIdx: number, name: string) {
    Alert.alert("Remove exercise?", `Remove ${name} from this workout? Your saved routine won't change.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeExercise(exerciseIdx) },
    ]);
  }

  if (isInitializing) {
    return (
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
          <WorkoutSessionSkeleton />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
    <SwipeBackGesture onSwipeBack={confirmDiscard}>
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <TouchableOpacity
          className="bg-surface-elevated rounded-lg px-3 py-2"
          onPress={confirmDiscard}
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
      <DraggableFlatList
        data={activeExercises}
        keyExtractor={(block) => block.exercise.id}
        onDragEnd={({ data }) => reorderExercises(data)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollBottomPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
        }
        ListFooterComponent={
          <TouchableOpacity
            className="border-2 border-dashed border-surface-elevated rounded-2xl py-4 items-center mt-2"
            onPress={() => setShowExercisePicker(true)}
          >
            <Text className="text-brand-400 font-medium">+ Add Exercise</Text>
          </TouchableOpacity>
        }
        renderItem={({ item: block, drag, isActive, getIndex }: RenderItemParams<ActiveExerciseBlock>) => {
          const exIdx = getIndex() ?? 0;
          return (
            <ScaleDecorator>
              <View className={`bg-surface-card rounded-2xl p-4 mb-4 ${isActive ? "opacity-90" : ""}`}>
                <View className="flex-row items-center mb-3">
                  <TouchableOpacity
                    onLongPress={drag}
                    disabled={isActive}
                    delayLongPress={150}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="pr-2"
                  >
                    <Ionicons name="reorder-three-outline" size={22} color={colors.text.muted} />
                  </TouchableOpacity>
                  <Text className="text-white font-bold text-base flex-1">{block.exercise.name}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveExercise(exIdx, block.exercise.name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="pl-2"
                    accessibilityLabel={`Remove ${block.exercise.name}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.text.muted} />
                  </TouchableOpacity>
                </View>

                {/* Set rows */}
                <View className="mb-2">
                  <View className="flex-row gap-2 mb-2">
                    <Text className="text-slate-500 text-xs w-8">Set</Text>
                    <Text className="text-slate-500 text-xs flex-1 text-center">Reps</Text>
                    <Text className="text-slate-500 text-xs flex-1 text-center">Weight (kg)</Text>
                    <View className="w-16" />
                    <View className="w-7" />
                  </View>

                  {block.sets.map((set, setIdx) => (
                    <SetRow
                      key={set.id}
                      setNumber={setIdx + 1}
                      defaultReps={set.reps}
                      defaultWeight={set.weight_kg}
                      completed={set.completed}
                      canRemove={block.sets.length > 1}
                      onRemove={() => removeSet(exIdx, setIdx)}
                      onCommit={(reps, weight) => handleCommitSet(exIdx, setIdx, reps, weight)}
                      onComplete={(reps, weight) => handleCompleteSet(exIdx, setIdx, reps, weight)}
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
            </ScaleDecorator>
          );
        }}
      />

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

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID}>
          <View
            className="flex-row justify-end bg-surface-elevated border-t border-surface-border px-4 py-2"
          >
            <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
              <Text className="text-brand-400 font-semibold text-base">Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </SafeAreaView>
    </SwipeBackGesture>
    </SafeAreaProvider>
  );
}

function SetRow({
  setNumber,
  defaultReps,
  defaultWeight,
  completed,
  canRemove,
  onRemove,
  onCommit,
  onComplete,
}: {
  setNumber: number;
  defaultReps: number | null;
  defaultWeight: number | null;
  completed: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onCommit: (reps: number, weight: number) => void;
  onComplete: (reps: number, weight: number) => void;
}) {
  const [reps, setReps] = useState(String(defaultReps ?? ""));
  const [weight, setWeight] = useState(String(defaultWeight ?? ""));

  // Persist edits to the store on blur so nothing is discarded, even without pressing Done.
  const commit = () => onCommit(parseInt(reps) || 0, parseFloat(weight) || 0);

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
        inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
        value={reps}
        onChangeText={setReps}
        onEndEditing={commit}
      />
      <AppTextInput
        className="flex-1 bg-surface-elevated text-white rounded-lg text-center"
        variant="compact"
        placeholder="0"
        keyboardType="decimal-pad"
        inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
        value={weight}
        onChangeText={setWeight}
        onEndEditing={commit}
      />
      <TouchableOpacity
        className={`w-16 py-2 rounded-lg items-center ${
          completed ? "bg-green-500/30" : "bg-brand-500"
        }`}
        onPress={() => onComplete(parseInt(reps) || 0, parseFloat(weight) || 0)}
      >
        <Text className={`text-sm font-semibold ${completed ? "text-green-400" : "text-white"}`}>
          {completed ? "✓" : "Done"}
        </Text>
      </TouchableOpacity>
      {canRemove ? (
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-7 items-center justify-center"
          accessibilityLabel={`Remove set ${setNumber}`}
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      ) : (
        <View className="w-7" />
      )}
    </View>
  );
}
