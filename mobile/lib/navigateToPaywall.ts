import { router, type Href } from "expo-router";

export function navigateToPaywall() {
  router.push("/paywall" as Href);
}
