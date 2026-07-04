import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { isOnline, isNetworkError } from "@/lib/network";
import {
  mergePendingNutritionLogs,
  buildOptimisticNutritionLog,
} from "@/lib/offlineNutrition";
import { useOfflineStore } from "@/stores/offlineStore";
import type { NutritionLog } from "@/types";
import type { MealType } from "@/constants";

export function useNutritionLogs(date: string) {
  const pendingNutritionLogs = useOfflineStore((s) => s.pendingNutritionLogs);

  const query = useQuery({
    queryKey: ["nutrition", date],
    queryFn: () => api.getNutritionLogs(date),
  });

  const data = mergePendingNutritionLogs(query.data ?? [], pendingNutritionLogs, date);

  return { ...query, data };
}

export function useLogFood() {
  const queryClient = useQueryClient();
  const queueNutritionLog = useOfflineStore((s) => s.queueNutritionLog);

  return useMutation({
    mutationFn: async (
      entry: Omit<NutritionLog, "id" | "user_id" | "created_at">
    ): Promise<NutritionLog> => {
      const online = await isOnline();

      if (!online) {
        const before = useOfflineStore.getState().pendingNutritionLogs.length;
        queueNutritionLog(entry);
        const queued = useOfflineStore.getState().pendingNutritionLogs[before];
        if (!queued) throw new Error("Could not queue offline log.");
        return buildOptimisticNutritionLog(entry, queued.local_id);
      }

      try {
        return await api.logFood(entry);
      } catch (error) {
        if (isNetworkError(error)) {
          const before = useOfflineStore.getState().pendingNutritionLogs.length;
          queueNutritionLog(entry);
          const queued = useOfflineStore.getState().pendingNutritionLogs[before];
          if (!queued) throw error;
          return buildOptimisticNutritionLog(entry, queued.local_id);
        }
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nutrition", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["streaks"] });
    },
  });
}

export function useDeleteNutritionLog() {
  const queryClient = useQueryClient();
  const clearPending = useOfflineStore((s) => s.clearPendingNutritionLog);

  return useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      if (id.startsWith("local_")) {
        clearPending(id);
        return;
      }
      await api.deleteNutritionLog(id);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nutrition", variables.date] });
    },
  });
}

export function useUpdateNutritionLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      date,
      updates,
    }: {
      id: string;
      date: string;
      updates: Parameters<typeof api.updateNutritionLog>[1];
    }) => api.updateNutritionLog(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nutrition", variables.date] });
      if (variables.updates.date && variables.updates.date !== variables.date) {
        queryClient.invalidateQueries({ queryKey: ["nutrition", variables.updates.date] });
      }
    },
  });
}

export function useFoodSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  const queryResult = useQuery({
    queryKey: ["food-search", debouncedQuery],
    queryFn: () => api.searchFoods(debouncedQuery),
    enabled: debouncedQuery.length > 1,
    staleTime: 1000 * 60 * 10,
  });

  return {
    ...queryResult,
    isDebouncing: query.trim().length > 1 && query.trim() !== debouncedQuery,
  };
}

export function useFoodBarcode(barcode: string | null) {
  return useQuery({
    queryKey: ["food-barcode", barcode],
    queryFn: () => api.getFoodByBarcode(barcode!),
    enabled: !!barcode,
  });
}

export function useWaterTotal(date: string) {
  return useQuery({
    queryKey: ["water", date],
    queryFn: () => api.getWaterTotal(date),
  });
}

export function useLogWater() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ date, amount_ml }: { date: string; amount_ml: number }) =>
      api.logWater(date, amount_ml),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["water", variables.date] });
    },
  });
}

export function useDaySummary(date: string) {
  const { data: logs = [] } = useNutritionLogs(date);
  const { data: water_ml = 0 } = useWaterTotal(date);

  const totals = logs.reduce(
    (acc, log) => ({
      calories: acc.calories + log.calories,
      protein_g: acc.protein_g + log.protein_g,
      carbs_g: acc.carbs_g + log.carbs_g,
      fat_g: acc.fat_g + log.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  return { ...totals, water_ml, logs };
}

export function useRecentFoods() {
  return useQuery({
    queryKey: ["recent-foods"],
    queryFn: () => api.getRecentFoods(12),
    staleTime: 1000 * 60 * 5,
  });
}

export type { MealType };
