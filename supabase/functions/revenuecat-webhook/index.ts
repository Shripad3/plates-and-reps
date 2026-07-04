import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

interface RevenueCatEvent {
  event?: {
    type?: string;
    app_user_id?: string;
    expiration_at_ms?: number | null;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!REVENUECAT_WEBHOOK_SECRET || auth !== `Bearer ${REVENUECAT_WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = (await req.json().catch(() => null)) as RevenueCatEvent | null;

    // Reject malformed payloads before touching the database
    if (!payload || typeof payload !== "object") {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = payload.event;
    const userId = event?.app_user_id;

    if (typeof userId !== "string" || !userId.trim()) {
      return new Response(JSON.stringify({ ok: true, skipped: "no user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof event?.type !== "string") {
      return new Response(JSON.stringify({ ok: true, skipped: "no event type" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const type = event?.type ?? "";
    const premiumEvents = new Set([
      "INITIAL_PURCHASE",
      "RENEWAL",
      "UNCANCELLATION",
      "PRODUCT_CHANGE",
    ]);
    const revokeEvents = new Set(["EXPIRATION"]);

    let isPremium = false;
    let premiumUntil: string | null = null;

    if (premiumEvents.has(type)) {
      isPremium = true;
      if (event.expiration_at_ms) {
        premiumUntil = new Date(event.expiration_at_ms).toISOString();
      }
    } else if (type === "CANCELLATION" || type === "BILLING_ISSUE") {
      // User cancelled auto-renew or hit billing issue — keep access until period ends.
      if (event.expiration_at_ms) {
        isPremium = event.expiration_at_ms > Date.now();
        premiumUntil = new Date(event.expiration_at_ms).toISOString();
      }
    } else if (revokeEvents.has(type)) {
      isPremium = false;
      premiumUntil = null;
    } else {
      return new Response(JSON.stringify({ ok: true, skipped: type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.rpc("set_user_premium", {
      p_user_id: userId,
      p_is_premium: isPremium,
      p_premium_until: premiumUntil,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, is_premium: isPremium }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
