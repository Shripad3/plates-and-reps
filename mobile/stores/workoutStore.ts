import { create } from "zustand";
import type { WorkoutSession, WorkoutSet, Exercise } from "@/types";

interface ActiveSet {
  exercise: Exercise;
  setNumber: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  is_warmup: boolean;
  completed: boolean;
}

interface ActiveExerciseBlock {
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
  completeSet: (exerciseIndex: number, setIndex: number, data: Partial<ActiveSet>) => void;
  addSet: (exerciseIndex: number) => void;
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
            setNumber: block.sets.length + 1,
            completed: false,
          },
        ],
      };
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
