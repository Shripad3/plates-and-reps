import { FREE_TIER, PREMIUM_TIER } from "./freeTier.ts";

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

/**
 * Shared limit check + record, done atomically.
 *
 * Free users hit the free-tier cap (with an upgrade prompt); premium users
 * still hit an absolute safety ceiling so a leaked/shared account or a runaway
 * client can't generate an unbounded bill.
 *
 * Uses the `consume_ai_usage` DB function, which counts and records the usage
 * event under a per-user advisory lock — so concurrent requests can't all pass
 * the check before any is recorded. A successful (allowed) call has ALREADY
 * recorded the usage; callers must NOT also call recordAiUsage.
 */
async function assertFeatureAllowed(
  supabase: SupabaseAdmin,
  userId: string,
  feature: AiFeature,
  freeLimit: number,
  premiumLimit: number,
  upgradeMessage: string
): Promise<string | null> {
  const premium = await isPremiumUser(supabase, userId);
  const limit = premium ? premiumLimit : freeLimit;

  const { data: allowed, error } = await supabase.rpc("consume_ai_usage", {
    p_user_id: userId,
    p_feature: feature,
    p_limit: limit,
  });

  if (error) {
    // Fail-open on infra error so a transient DB hiccup doesn't hard-block the
    // feature, but surface it in logs.
    console.error("consume_ai_usage error:", error.message ?? error);
    return null;
  }

  if (allowed === false) {
    return premium
      ? `Daily safety limit reached (${limit}/day). This is unusually high usage — please try again tomorrow, or contact support if you need it raised.`
      : upgradeMessage;
  }
  return null;
}

export function assertChatAllowed(supabase: SupabaseAdmin, userId: string): Promise<string | null> {
  return assertFeatureAllowed(
    supabase, userId, "ai_chat",
    FREE_TIER.AI_CHAT_DAILY_LIMIT, PREMIUM_TIER.AI_CHAT_DAILY_LIMIT,
    `Daily AI chat limit reached (${FREE_TIER.AI_CHAT_DAILY_LIMIT}/day on free plan). Upgrade to Premium for unlimited coaching.`
  );
}

export function assertPhotoAnalysisAllowed(supabase: SupabaseAdmin, userId: string): Promise<string | null> {
  return assertFeatureAllowed(
    supabase, userId, "photo_analysis",
    FREE_TIER.PHOTO_ANALYSIS_DAILY_LIMIT, PREMIUM_TIER.PHOTO_ANALYSIS_DAILY_LIMIT,
    `Daily photo analysis limit reached (${FREE_TIER.PHOTO_ANALYSIS_DAILY_LIMIT}/day on free plan). Upgrade to Premium for unlimited AI logging.`
  );
}

export function assertVoiceLogAllowed(supabase: SupabaseAdmin, userId: string): Promise<string | null> {
  return assertFeatureAllowed(
    supabase, userId, "voice_log",
    FREE_TIER.VOICE_LOG_DAILY_LIMIT, PREMIUM_TIER.VOICE_LOG_DAILY_LIMIT,
    `Daily voice log limit reached (${FREE_TIER.VOICE_LOG_DAILY_LIMIT}/day on free plan). Upgrade to Premium for unlimited AI logging.`
  );
}

export function assertSearchAllowed(supabase: SupabaseAdmin, userId: string): Promise<string | null> {
  return assertFeatureAllowed(
    supabase, userId, "food_search",
    FREE_TIER.FOOD_SEARCH_DAILY_LIMIT, PREMIUM_TIER.FOOD_SEARCH_DAILY_LIMIT,
    `Daily food search limit reached (${FREE_TIER.FOOD_SEARCH_DAILY_LIMIT}/day on free plan). Upgrade to Premium for unlimited searches.`
  );
}

export function assertRcSyncAllowed(supabase: SupabaseAdmin, userId: string): Promise<string | null> {
  return assertFeatureAllowed(
    supabase, userId, "rc_sync",
    FREE_TIER.RC_SYNC_DAILY_LIMIT, PREMIUM_TIER.RC_SYNC_DAILY_LIMIT,
    `Subscription sync limit reached (${FREE_TIER.RC_SYNC_DAILY_LIMIT}/day). Try again tomorrow.`
  );
}
