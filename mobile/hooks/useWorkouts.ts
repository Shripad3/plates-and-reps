import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { WorkoutSession, WorkoutSet, WorkoutTemplate, Exercise } from "@/types";

export function useWorkoutTemplates() {
  return useQuery({
    queryKey: ["workout-templates"],
    queryFn: api.getWorkoutTemplates,
  });
}

export function useCreateWorkoutTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (template: Omit<WorkoutTemplate, "id">) =>
      api.createWorkoutTemplate(template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout-templates"] });
    },
  });
}

export function useUpdateWorkoutTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<WorkoutTemplate, "name" | "description" | "exercises">>;
    }) => api.updateWorkoutTemplate(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout-templates"] });
    },
  });
}

export function useDeleteWorkoutTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteWorkoutTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout-templates"] });
    },
  });
}

export function useWorkoutSessions() {
  return useQuery({
    queryKey: ["workout-sessions"],
    queryFn: () => api.getWorkoutSessions(20),
  });
}

export function useSessionSets(sessionId: string | null) {
  return useQuery({
    queryKey: ["session-sets", sessionId],
    queryFn: () => api.getSessionSets(sessionId!),
    enabled: !!sessionId,
  });
}

export function useCreateWorkoutSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (session: Omit<WorkoutSession, "id" | "user_id">) =>
      api.createWorkoutSession(session),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout-sessions"] });
    },
  });
}

export function useCompleteWorkoutSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      updates,
    }: {
      sessionId: string;
      updates: { completed_at: string; duration_seconds: number; notes?: string };
    }) => api.completeWorkoutSession(sessionId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout-sessions"] });
    },
  });
}

export function useLogWorkoutSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (set: Omit<WorkoutSet, "id">) => api.logWorkoutSet(set),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["session-sets", variables.session_id],
      });
    },
  });
}

export function useExerciseSearch(query: string, muscleGroup?: string, enabled = true) {
  return useQuery({
    queryKey: ["exercises", query, muscleGroup],
    queryFn: () => api.searchExercises(query, muscleGroup),
    staleTime: 1000 * 60 * 10,
    enabled,
  });
}

export function useCreateExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      muscle_groups?: string[];
      equipment?: string[];
      category?: Exercise["category"];
    }) => api.createExercise(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
    },
  });
}

export function useDeleteWorkoutSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => api.deleteWorkoutSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout-sessions"] });
    },
  });
}
