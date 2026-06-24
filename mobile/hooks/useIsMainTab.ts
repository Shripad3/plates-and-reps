import { useSegments } from "expo-router";

const MAIN_TABS = new Set(["home", "nutrition", "workouts", "social", "progress"]);

export function useIsMainTab(): boolean {
  const segments = useSegments();
  if (segments[0] !== "(tabs)") return false;
  const tab = segments[1];
  if (!tab || !MAIN_TABS.has(tab)) return false;
  return segments.length <= 2;
}
