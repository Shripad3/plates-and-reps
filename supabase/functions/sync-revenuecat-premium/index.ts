import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { assertRcSyncAllowed, recordAiUsage } from "../_shared/usageLimits.ts";
import { respond429 } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REVENUECAT_SECRET_KEY = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";
const PREMIUM_ENTITLEMENT = "premium";

interface RevenueCatSubscriberResponse {
  subscriber?: {
    entitlements?: Record<
      string,
      {
        expires_date?: string | null;
        grace_period_expires_date?: string | null;
      }
    >;
  };
}

function isEntitlementActive(
  expiresDate?: string | null,
  gracePeriodExpiresDate?: string | null
): boolean {
  const now = Date.now();
  if (gracePeriodExpiresDate && new Date(gracePeriodExpiresDate).getTime() > now) {
    return true;
  }
  if (!expiresDate) return true;
  return new Date(expiresDate).getTime() > now;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!REVENUECAT_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "REVENUECAT_SECRET_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const limitError = await assertRcSyncAllowed(admin, user.id);
  if (limitError) return respond429(limitError);
  await recordAiUsage(admin, user.id, "rc_sync");

  try {
    const rcRes = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
      {
        headers: {
          Authorization: `Bearer ${REVENUECAT_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!rcRes.ok) {
      const body = await rcRes.text();
      throw new Error(`RevenueCat API ${rcRes.status}: ${body}`);
    }

    const rcData = (await rcRes.json()) as RevenueCatSubscriberResponse;
    const entitlement = rcData.subscriber?.entitlements?.[PREMIUM_ENTITLEMENT];
    const isPremium =
      !!entitlement &&
      isEntitlementActive(entitlement.expires_date, entitlement.grace_period_expires_date);
    const premiumUntil = entitlement?.expires_date ?? null;

    const { error } = await admin.rpc("set_user_premium", {
      p_user_id: user.id,
      p_is_premium: isPremium,
      p_premium_until: premiumUntil,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, is_premium: isPremium, premium_until: premiumUntil }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
