import type { QueryClient } from "@tanstack/react-query";

/** Invalidate caches that AI tools may modify. */
export function invalidateAfterAiAction(queryClient: QueryClient) {
  const keys = [
    ["nutrition"],
    ["water"],
    ["workout-sessions"],
    ["workout-templates"],
    ["body-metrics"],
    ["goal"],
    ["profile"],
    ["streaks"],
    ["feed"],
    ["challenges"],
  ] as const;

  keys.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  });
}
