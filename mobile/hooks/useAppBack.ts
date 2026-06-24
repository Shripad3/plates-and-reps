import { useCallback } from "react";
import { router, useSegments } from "expo-router";
import {
  isMainTabRouteKey,
  normalizeRouteKey,
  routeKeyToHref,
  segmentsToRouteKey,
} from "@/lib/navigationHistory";
import { useNavigationHistoryStore } from "@/stores/navigationHistoryStore";

function navigateToRoute(routeKey: string) {
  router.navigate(routeKeyToHref(routeKey));
}

/**
 * Returns to the screen the user actually came from — including cross-tab
 * navigation (e.g. Social feed → workout detail → Social).
 */
export function useAppBack() {
  const segments = useSegments();
  const popRoute = useNavigationHistoryStore((s) => s.pop);

  return useCallback(() => {
    const currentRoute = segmentsToRouteKey(segments);
    if (!currentRoute) {
      if (router.canGoBack()) router.back();
      return;
    }

    if (isMainTabRouteKey(currentRoute)) {
      const previous = popRoute(currentRoute);
      if (previous) navigateToRoute(previous);
      return;
    }

    // Sub-routes: prefer visit history over router.back() (tab stacks lie).
    const stack = useNavigationHistoryStore.getState().stack;
    const idx = stack.lastIndexOf(normalizeRouteKey(currentRoute));
    if (idx > 0) {
      const previous = popRoute(currentRoute);
      if (previous) navigateToRoute(previous);
      return;
    }

    if (router.canGoBack()) {
      router.back();
    }
  }, [segments, popRoute]);
}
