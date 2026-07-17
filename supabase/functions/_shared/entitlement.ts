import { TRIAL_MS } from "./aiConfig.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export interface Entitlement {
  allowed: boolean;
  reason?: "trial_expired";
  /** Start the trial only AFTER a successful, validated generation. */
  startTrialAfterSuccess: boolean;
}

/**
 * Server-authoritative access resolution for any AI feature, per-feature trial.
 *   paid → full access (ignore trial)
 *   no trial row → first use (caller starts the trial only on success)
 *   within TRIAL_MS → allowed
 *   expired → denied (402-style upgrade)
 * A modified client cannot start/reset/extend the trial (ai_trials is written
 * only by the service-role start_ai_trial RPC).
 */
export async function resolveEntitlement(
  admin: SupabaseAdmin,
  userId: string,
  feature: string
): Promise<Entitlement> {
  const { data: profile } = await admin
    .from("user_profiles")
    .select("is_premium, premium_until")
    .eq("id", userId)
    .single();

  const now = Date.now();
  const premiumActive =
    !!profile?.is_premium &&
    (!profile.premium_until || new Date(profile.premium_until).getTime() > now);
  if (premiumActive) return { allowed: true, startTrialAfterSuccess: false };

  const { data: trial } = await admin
    .from("ai_trials")
    .select("started_at")
    .eq("user_id", userId)
    .eq("feature", feature)
    .maybeSingle();

  if (!trial) return { allowed: true, startTrialAfterSuccess: true }; // first use
  const started = new Date(trial.started_at).getTime();
  if (now < started + TRIAL_MS) return { allowed: true, startTrialAfterSuccess: false };
  return { allowed: false, reason: "trial_expired", startTrialAfterSuccess: false };
}
