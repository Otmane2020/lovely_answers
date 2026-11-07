import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── 3 tiers × 2 cycles (USD) ──
const PRICES: Record<string, Record<string, string>> = {
  starter: {
    monthly: "price_1TZI35Efti9t9nN9yj0tBl4c",
    annual:  "price_1TZIB3Efti9t9nN9A4NxsNsg",
  },
  pro: {
    monthly: "price_1TZIBYEfti9t9nN9lG9JGwUa",
    annual:  "price_1TZIBfEfti9t9nN9ZYClUCvF",
  },
  agency: {
    monthly: "price_1TZIBjEfti9t9nN9ToqTd8xu",
    annual:  "price_1TZIBnEfti9t9nN9fmZiURZR",
  },
};

// Legacy fallback (older flow with `plan: "monthly"|"annual"`).
const LEGACY_PRICES: Record<string, string> = {
  monthly: PRICES.pro.monthly,
  annual:  PRICES.pro.annual,
};

const TRIAL_DAYS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    console.log("[CREATE-CHECKOUT] Starting");

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const planTier = (body.plan ?? "pro").toString();   // "starter" | "pro" | "agency" | legacy "monthly"/"annual"
    const cycle    = (body.cycle ?? "monthly").toString(); // "monthly" | "annual"
    const guestEmail: string | null = body.email || null;
    const isGuest = body.guest === true;

    // Resolve price ID (new shape or legacy)
    let priceId: string | undefined;
    if (PRICES[planTier]) {
      priceId = PRICES[planTier][cycle] ?? PRICES[planTier].monthly;
    } else if (LEGACY_PRICES[planTier]) {
      priceId = LEGACY_PRICES[planTier];
    }
    if (!priceId) throw new Error(`Unknown plan/cycle: ${planTier}/${cycle}`);

    console.log("[CREATE-CHECKOUT] plan:", planTier, "cycle:", cycle, "priceId:", priceId, "guest:", isGuest);

    let userEmail: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabaseClient.auth.getUser(token);
      if (data.user?.email) userEmail = data.user.email;
    }
    if (!userEmail && guestEmail && isGuest) userEmail = guestEmail;
    if (!userEmail) throw new Error("Email is required for checkout");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer already exists
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = req.headers.get("origin") || "https://autopilotgeo.com";
    const uiMode = (body.ui_mode === "hosted" ? "hosted" : "embedded") as "embedded" | "hosted";

    const sessionParams: any = {
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      // 3-day free trial — card required, auto-charged on day 4 unless cancelled.
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        trial_settings: {
          end_behavior: { missing_payment_method: "cancel" },
        },
        metadata: {
          plan: planTier,
          cycle,
        },
      },
      payment_method_collection: "always",
      ui_mode: uiMode,
    };

    if (uiMode === "embedded") {
      // Embedded checkout — Stripe renders inside our page, no redirect.
      sessionParams.return_url = `${origin}/thank-you?session_id={CHECKOUT_SESSION_ID}`;
    } else {
      sessionParams.success_url = isGuest
        ? `${origin}/auth?mode=signup&checkout=success`
        : `${origin}/thank-you?session_id={CHECKOUT_SESSION_ID}`;
      sessionParams.cancel_url = `${origin}/pricing`;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log("[CREATE-CHECKOUT] Session created:", session.id, "ui_mode:", uiMode);

    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
        client_secret: (session as any).client_secret ?? null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("[CREATE-CHECKOUT] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
