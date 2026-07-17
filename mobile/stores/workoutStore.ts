import { create } from "zustand";
import type { WorkoutSession, WorkoutSet, Exercise } from "@/types";

export interface ActiveSet {
  id: string;
  exercise: Exercise;
  setNumber: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  is_warmup: boolean;
  completed: boolean;
}

let setIdCounter = 0;
/** Stable id for a set row so list reconciliation survives insert/remove/reorder. */
export function makeSetId(): string {
  setIdCounter += 1;
  return `set_${Date.now()}_${setIdCounter}`;
}

export interface ActiveExerciseBlock {
  exercise: Exercise;
  sets: ActiveSet[];
}

interface WorkoutStoreState {
  activeSession: WorkoutSession | null;
  activeExercises: ActiveExerciseBlock[];
  startedAt: Date | null;
  isRestTimerRunning: boolean;
  restSecondsRemaining: number;

  startSession: (session: WorkoutSession, exercises: ActiveExerciseBlock[]) => void;
  addExercise: (exercise: Exercise) => boolean;
  removeExercise: (exerciseIndex: number) => void;
  completeSet: (exerciseIndex: number, setIndex: number, data: Partial<ActiveSet>) => void;
  updateSet: (exerciseIndex: number, setIndex: number, data: Partial<ActiveSet>) => void;
  addSet: (exerciseIndex: number) => void;
  removeSet: (exerciseIndex: number, setIndex: number) => void;
  reorderExercises: (exercises: ActiveExerciseBlock[]) => void;
  startRestTimer: (seconds: number) => void;
  tickRestTimer: () => void;
  stopRestTimer: () => void;
  endSession: () => void;
}

export const useWorkoutStore = create<WorkoutStoreState>((set, get) => ({
  activeSession: null,
  activeExercises: [],
  startedAt: null,
  isRestTimerRunning: false,
  restSecondsRemaining: 0,

  startSession: (session, exercises) =>
    set({ activeSession: session, activeExercises: exercises, startedAt: new Date() }),

  addExercise: (exercise) => {
    const { activeExercises } = get();
    if (activeExercises.some((block) => block.exercise.id === exercise.id)) {
      return false;
    }

    const block: ActiveExerciseBlock = {
      exercise,
      sets: [
        {
          id: makeSetId(),
          exercise,
          setNumber: 1,
          reps: null,
          weight_kg: null,
          rpe: null,
          is_warmup: false,
          completed: false,
        },
      ],
    };
    set((state) => ({ activeExercises: [...state.activeExercises, block] }));
    return true;
  },

  // Session-only: drops the exercise from this workout's copy, never the template.
  removeExercise: (exerciseIndex) =>
    set((state) => ({
      activeExercises: state.activeExercises.filter((_, i) => i !== exerciseIndex),
    })),

  completeSet: (exerciseIndex, setIndex, data) => {
    set((state) => {
      const exercises = [...state.activeExercises];
      exercises[exerciseIndex] = {
        ...exercises[exerciseIndex],
        sets: exercises[exerciseIndex].sets.map((s, i) =>
          i === setIndex ? { ...s, ...data, completed: true } : s
        ),
      };
      return { activeExercises: exercises };
    });
  },

  // Commit edited reps/weight without changing completion state (fields stay editable).
  updateSet: (exerciseIndex, setIndex, data) => {
    set((state) => {
      const exercises = [...state.activeExercises];
      const block = exercises[exerciseIndex];
      if (!block) return {};
      exercises[exerciseIndex] = {
        ...block,
        sets: block.sets.map((s, i) => (i === setIndex ? { ...s, ...data } : s)),
      };
      return { activeExercises: exercises };
    });
  },

  reorderExercises: (exercises) => set({ activeExercises: exercises }),

  addSet: (exerciseIndex) => {
    set((state) => {
      const exercises = [...state.activeExercises];
      const block = exercises[exerciseIndex];
      const lastSet = block.sets[block.sets.length - 1];
      exercises[exerciseIndex] = {
        ...block,
        sets: [
          ...block.sets,
          {
            ...lastSet,
            id: makeSetId(),
            setNumber: block.sets.length + 1,
            completed: false,
          },
        ],
      };
      return { activeExercises: exercises };
    });
  },

  removeSet: (exerciseIndex, setIndex) => {
    set((state) => {
      const exercises = [...state.activeExercises];
      const block = exercises[exerciseIndex];
      if (!block || block.sets.length <= 1) return {}; // keep at least 1 set
      const nextSets = block.sets
        .filter((_, i) => i !== setIndex)
        .map((s, i) => ({ ...s, setNumber: i + 1 })); // renumber sequentially
      exercises[exerciseIndex] = { ...block, sets: nextSets };
      return { activeExercises: exercises };
    });
  },

  startRestTimer: (seconds) =>
    set({ isRestTimerRunning: true, restSecondsRemaining: seconds }),

  tickRestTimer: () => {
    const remaining = get().restSecondsRemaining - 1;
    if (remaining <= 0) {
      set({ isRestTimerRunning: false, restSecondsRemaining: 0 });
    } else {
      set({ restSecondsRemaining: remaining });
    }
  },

  stopRestTimer: () => set({ isRestTimerRunning: false, restSecondsRemaining: 0 }),

  endSession: () =>
    set({ activeSession: null, activeExercises: [], startedAt: null }),
}));
