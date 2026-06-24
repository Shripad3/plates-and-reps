import type { NutritionLog } from "@/types";
import type { MealType } from "@/constants";

type PendingNutritionLog = Omit<NutritionLog, "id"> & { local_id: string };

export function pendingToNutritionLog(pending: PendingNutritionLog): NutritionLog {
  const { local_id, ...rest } = pending;
  return {
    ...rest,
    id: local_id,
    user_id: "offline",
  };
}

export function mergePendingNutritionLogs(
  serverLogs: NutritionLog[],
  pending: PendingNutritionLog[],
  date: string
): NutritionLog[] {
  const pendingForDate = pending
    .filter((log) => log.date === date)
    .map(pendingToNutritionLog);
  return [...serverLogs, ...pendingForDate];
}

export function isPendingLogId(id: string): boolean {
  return id.startsWith("local_");
}

export function buildOptimisticNutritionLog(
  entry: Omit<NutritionLog, "id" | "user_id" | "created_at">,
  localId: string
): NutritionLog {
  return {
    ...entry,
    id: localId,
    user_id: "offline",
    created_at: new Date().toISOString(),
  };
}

export function isValidMealType(value: string): value is MealType {
  return ["breakfast", "lunch", "dinner", "snack"].includes(value);
}
