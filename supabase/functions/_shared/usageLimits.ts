import { FREE_TIER } from "./freeTier.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export type AiFeature = "ai_chat" | "photo_analysis" | "voice_log" | "food_search" | "rc_sync";

export async function isPremiumUser(
  supabase: SupabaseAdmin,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("user_profiles")
    .select("is_premium, premium_until")
    .eq("id", userId)
    .single();

  if (!data?.is_premium) return false;
  if (data.premium_until && new Date(data.premium_until) < new Date()) {
    return false;
  }
  return true;
}

export async function countAiUsageToday(
  supabase: SupabaseAdmin,
  userId: string,
  feature: AiFeature
): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const { count } = await supabase
    .from("ai_usage_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", `${today}T00:00:00Z`);

  return count ?? 0;
}

export async function recordAiUsage(
  supabase: SupabaseAdmin,
  userId: string,
  feature: AiFeature
): Promise<void> {
  await supabase.from("ai_usage_events").insert({ user_id: userId, feature });
}

export async function assertChatAllowed(
  supabase: SupabaseAdmin,
  userId: string
): Promise<string | null> {
  if (await isPremiumUser(supabase, userId)) return null;
  const used = await countAiUsageToday(supabase, userId, "ai_chat");
  if (used >= FREE_TIER.AI_CHAT_DAILY_LIMIT) {
    return `Daily AI chat limit reached (${FREE_TIER.AI_CHAT_DAILY_LIMIT}/day on free plan). Upgrade to Premium for unlimited coaching.`;
  }
  return null;
}

export async function assertPhotoAnalysisAllowed(
  supabase: SupabaseAdmin,
  userId: string
): Promise<string | null> {
  if (await isPremiumUser(supabase, userId)) return null;
  const used = await countAiUsageToday(supabase, userId, "photo_analysis");
  if (used >= FREE_TIER.PHOTO_ANALYSIS_DAILY_LIMIT) {
    return `Daily photo analysis limit reached (${FREE_TIER.PHOTO_ANALYSIS_DAILY_LIMIT}/day on free plan). Upgrade to Premium for unlimited AI logging.`;
  }
  return null;
}

export async function assertVoiceLogAllowed(
  supabase: SupabaseAdmin,
  userId: string
): Promise<string | null> {
  if (await isPremiumUser(supabase, userId)) return null;
  const used = await countAiUsageToday(supabase, userId, "voice_log");
  if (used >= FREE_TIER.VOICE_LOG_DAILY_LIMIT) {
    return `Daily voice log limit reached (${FREE_TIER.VOICE_LOG_DAILY_LIMIT}/day on free plan). Upgrade to Premium for unlimited AI logging.`;
  }
  return null;
}

export async function assertSearchAllowed(
  supabase: SupabaseAdmin,
  userId: string
): Promise<string | null> {
  if (await isPremiumUser(supabase, userId)) return null;
  const used = await countAiUsageToday(supabase, userId, "food_search");
  if (used >= FREE_TIER.FOOD_SEARCH_DAILY_LIMIT) {
    return `Daily food search limit reached (${FREE_TIER.FOOD_SEARCH_DAILY_LIMIT}/day on free plan). Upgrade to Premium for unlimited searches.`;
  }
  return null;
}

export async function assertRcSyncAllowed(
  supabase: SupabaseAdmin,
  userId: string
): Promise<string | null> {
  if (await isPremiumUser(supabase, userId)) return null;
  const used = await countAiUsageToday(supabase, userId, "rc_sync");
  if (used >= FREE_TIER.RC_SYNC_DAILY_LIMIT) {
    return `Subscription sync limit reached (${FREE_TIER.RC_SYNC_DAILY_LIMIT}/day). Try again tomorrow.`;
  }
  return null;
}
