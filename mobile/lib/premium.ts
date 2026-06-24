import { FREE_TIER } from "@/constants";
import type { UserProfile } from "@/types";

export function isPremiumProfile(profile: UserProfile | null | undefined): boolean {
  if (!profile?.is_premium) return false;
  if (profile.premium_until && new Date(profile.premium_until) < new Date()) {
    return false;
  }
  return true;
}

export function getHistoryDaysLimit(profile: UserProfile | null | undefined): number {
  return isPremiumProfile(profile) ? 3650 : FREE_TIER.HISTORY_DAYS;
}

export function historyCutoffDate(profile: UserProfile | null | undefined): string {
  const days = getHistoryDaysLimit(profile);
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since.toISOString().split("T")[0];
}
