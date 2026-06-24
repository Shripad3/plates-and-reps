import type { Href } from "expo-router";

const MAIN_TABS = new Set(["home", "nutrition", "workouts", "social", "progress"]);

export const MAIN_TAB_ROUTE_KEYS = new Set(
  [...MAIN_TABS].map((tab) => `${tab}/index`)
);

/** Bare tab segment or full route key → canonical route key. */
export function normalizeRouteKey(route: string): string {
  if (MAIN_TABS.has(route)) return `${route}/index`;
  return route;
}

export function isMainTabRouteKey(routeKey: string): boolean {
  return MAIN_TAB_ROUTE_KEYS.has(normalizeRouteKey(routeKey));
}

export function segmentsToRouteKey(segments: readonly string[]): string | null {
  const tabsIdx = segments.indexOf("(tabs)");
  if (tabsIdx !== -1) {
    const rest = segments.slice(tabsIdx + 1);
    if (rest.length === 0) return null;
    return normalizeRouteKey(rest.join("/"));
  }

  const first = segments[0];
  if (!first) return null;
  if (first === "chat") return "chat/index";
  if (first === "workout-session") return "workout-session/index";
  if (first === "paywall") return "paywall";
  if (first === "(auth)") return segments[1] ?? null;

  return segments.join("/");
}

/** Normalize expo-router pathname to a stable route key. */
export function pathnameToRouteKey(pathname: string): string {
  const clean = pathname.replace(/^\//, "").replace(/\/$/, "") || "home";
  const firstSegment = clean.split("/")[0];
  if (MAIN_TABS.has(firstSegment) && !clean.includes("/")) {
    return `${firstSegment}/index`;
  }
  if (clean === "profile") return "profile/index";
  if (clean === "chat") return "chat/index";
  if (clean === "workout-session") return "workout-session/index";
  return clean;
}

export function routeKeyToHref(routeKey: string): Href {
  const route = normalizeRouteKey(routeKey);

  if (route === "chat/index") return "/chat" as Href;
  if (route === "workout-session/index") return "/workout-session" as Href;
  if (route === "paywall") return "/paywall" as Href;
  if (route.startsWith("legal/")) return `/${route}` as Href;

  if (route.endsWith("/index")) {
    const tab = route.replace(/\/index$/, "");
    return `/(tabs)/${tab}` as Href;
  }

  return `/(tabs)/${route}` as Href;
}
