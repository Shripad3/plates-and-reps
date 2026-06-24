import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOfflineStore } from "@/stores/offlineStore";
import * as api from "@/lib/api";
import { captureError } from "@/lib/errorReporting";
import { isOnline } from "@/lib/network";

let syncInFlight: Promise<void> | null = null;

async function runSync(queryClient: ReturnType<typeof useQueryClient>) {
  const state = useOfflineStore.getState();
  if (
    state.pendingNutritionLogs.length === 0 &&
    state.pendingWorkoutSessions.length === 0
  ) {
    return;
  }

  if (!(await isOnline())) return;

  state.setIsSyncing(true);

  try {
    for (const log of state.pendingNutritionLogs) {
      try {
        const { local_id, ...entry } = log;
        await api.logFood(entry as Parameters<typeof api.logFood>[0]);
        state.clearPendingNutritionLog(local_id);
        queryClient.invalidateQueries({ queryKey: ["nutrition", entry.date] });
      } catch (error) {
        captureError(error, { scope: "offline-sync-nutrition", local_id: log.local_id });
      }
    }

    for (const session of state.pendingWorkoutSessions) {
      try {
        const { local_id, pending_sets, ...sessionData } = session;
        const created = await api.createWorkoutSession(
          sessionData as Parameters<typeof api.createWorkoutSession>[0]
        );
        for (const set of pending_sets) {
          await api.logWorkoutSet({ ...set, session_id: created.id });
        }
        if (sessionData.completed_at && session.share_to_feed) {
          await api.publishActivityFeedItem(
            "workout_completed",
            created.id,
            {
              workout_name: sessionData.name,
              duration_seconds: sessionData.duration_seconds ?? 0,
            }
          );
        }
        state.clearPendingWorkoutSession(local_id);
        queryClient.invalidateQueries({ queryKey: ["workout-sessions"] });
        queryClient.invalidateQueries({ queryKey: ["feed"] });
      } catch (error) {
        captureError(error, { scope: "offline-sync-workout", local_id: session.local_id });
      }
    }
  } finally {
    useOfflineStore.getState().setIsSyncing(false);
  }
}

function sync(queryClient: ReturnType<typeof useQueryClient>) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync(queryClient).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const pendingNutritionLogs = useOfflineStore((s) => s.pendingNutritionLogs);
  const pendingWorkoutSessions = useOfflineStore((s) => s.pendingWorkoutSessions);
  const isSyncing = useOfflineStore((s) => s.isSyncing);

  const pendingCount = pendingNutritionLogs.length + pendingWorkoutSessions.length;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (pendingCount > 0) {
      sync(queryClient);
      intervalRef.current = setInterval(() => sync(queryClient), 30_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pendingCount, queryClient]);

  return { isSyncing, pendingCount };
}
