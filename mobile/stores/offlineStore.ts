import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NutritionLog, WorkoutSession, WorkoutSet } from "@/types";

interface PendingNutritionLog
  extends Omit<NutritionLog, "id" | "user_id" | "created_at"> {
  local_id: string;
}

interface PendingWorkoutSession extends Omit<WorkoutSession, "id" | "user_id"> {
  local_id: string;
  pending_sets: Omit<WorkoutSet, "id" | "session_id">[];
  share_to_feed?: boolean;
}

interface OfflineState {
  pendingNutritionLogs: PendingNutritionLog[];
  pendingWorkoutSessions: PendingWorkoutSession[];
  isSyncing: boolean;

  queueNutritionLog: (
    log: Omit<NutritionLog, "id" | "user_id" | "created_at">
  ) => void;
  queueWorkoutSession: (
    session: Omit<WorkoutSession, "id" | "user_id">,
    sets: Omit<WorkoutSet, "id" | "session_id">[],
    options?: { shareToFeed?: boolean }
  ) => void;
  clearPendingNutritionLog: (localId: string) => void;
  clearPendingWorkoutSession: (localId: string) => void;
  clearPendingQueue: () => void;
  setIsSyncing: (value: boolean) => void;
}

function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      pendingNutritionLogs: [],
      pendingWorkoutSessions: [],
      isSyncing: false,

      queueNutritionLog: (log) =>
        set((state) => ({
          pendingNutritionLogs: [
            ...state.pendingNutritionLogs,
            { ...log, local_id: generateLocalId() },
          ],
        })),

      queueWorkoutSession: (session, sets, options) =>
        set((state) => ({
          pendingWorkoutSessions: [
            ...state.pendingWorkoutSessions,
            {
              ...session,
              local_id: generateLocalId(),
              pending_sets: sets,
              share_to_feed: options?.shareToFeed ?? false,
            },
          ],
        })),

      clearPendingNutritionLog: (localId) =>
        set((state) => ({
          pendingNutritionLogs: state.pendingNutritionLogs.filter((l) => l.local_id !== localId),
        })),

      clearPendingWorkoutSession: (localId) =>
        set((state) => ({
          pendingWorkoutSessions: state.pendingWorkoutSessions.filter((s) => s.local_id !== localId),
        })),

      clearPendingQueue: () =>
        set({ pendingNutritionLogs: [], pendingWorkoutSessions: [], isSyncing: false }),

      setIsSyncing: (value) => set({ isSyncing: value }),
    }),
    {
      name: "platesandreps-offline-queue",
      storage: createJSONStorage(() => AsyncStorage),
      // Never persist isSyncing — always start as false after app kill
      partialize: (state) => ({
        pendingNutritionLogs: state.pendingNutritionLogs,
        pendingWorkoutSessions: state.pendingWorkoutSessions,
      }),
    }
  )
);
