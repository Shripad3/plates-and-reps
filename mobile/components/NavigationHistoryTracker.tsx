import { useEffect, useRef } from "react";
import { useSegments } from "expo-router";
import { segmentsToRouteKey } from "@/lib/navigationHistory";
import { useNavigationHistoryStore } from "@/stores/navigationHistoryStore";

const AUTH_ROUTES = new Set(["login", "signup", "onboarding"]);

/**
 * Records every screen visit so edge-swipe back can return to the true previous screen,
 * including tab switches that React Navigation does not put on the back stack.
 */
export function NavigationHistoryTracker() {
  const segments = useSegments();
  const push = useNavigationHistoryStore((s) => s.push);
  const reset = useNavigationHistoryStore((s) => s.reset);
  const prevRouteRef = useRef<string | null>(null);

  useEffect(() => {
    const route = segmentsToRouteKey(segments);
    if (!route) return;

    const prevRoute = prevRouteRef.current;
    prevRouteRef.current = route;

    const prevRoot = prevRoute?.split("/")[0];
    if (prevRoot && AUTH_ROUTES.has(prevRoot) && !AUTH_ROUTES.has(route.split("/")[0])) {
      reset(route);
      return;
    }

    push(route);
  }, [segments, push, reset]);

  return null;
}
