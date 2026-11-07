import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRICES: Record<string, Record<string, string>> = {
  starter: {
    monthly: "price_1TZI35Efti9t9nN9yj0tBl4c",
    annual: "price_1TZIB3Efti9t9nN9A4NxsNsg",
  },
  pro: {
    monthly: "price_1TZIBYEfti9t9nN9lG9JGwUa",
    annual: "price_1TZIBfEfti9t9nN9ZYClUCvF",
  },
  agency: {
    monthly: "price_1TZIBjEfti9t9nN9ToqTd8xu",
    annual: "price_1TZIBnEfti9t9nN9fmZiURZR",
  },
};

const TRIAL_DAYS = 3;

// Map of known promo codes -> Stripe coupon IDs
const PROMO_CODES: Record<string, { coupon: string; label: string }> = {
  WELCOME10: { coupon: "auqNm7gc", label: "10% off — Welcome offer" },
};

function getStripeKey() {
  const key = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();

  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }

  if (key.startsWith("pk_")) {
    throw new Error("STRIPE_SECRET_KEY is a publishable key. Use a Stripe secret key instead.");
  }

  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_") && !key.startsWith("rk_test_") && !key.startsWith("rk_live_")) {
    throw new Error("STRIPE_SECRET_KEY must start with sk_test_, sk_live_, rk_test_, or rk_live_");
  }

  return key;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan ?? "pro");
    const cycle = String(body.cycle ?? "annual");
    const priceId = PRICES[plan]?.[cycle];
    if (!priceId) throw new Error(`Unknown plan/cycle: ${plan}/${cycle}`);

    const rawPromo = String(body.promo_code ?? "").trim().toUpperCase();
    let appliedPromo:
      | { code: string; label: string; coupon?: string; promotion_code?: string }
      | null = null;

    const stripe = new Stripe(getStripeKey(), { apiVersion: "2025-08-27.basil" });

    if (rawPromo) {
      const hardcoded = PROMO_CODES[rawPromo];
      if (hardcoded) {
        appliedPromo = { ...hardcoded, code: rawPromo };
      } else {
        // Look up an actual Stripe promotion code (case-insensitive in Stripe)
        const found = await stripe.promotionCodes.list({
          code: rawPromo,
          active: true,
          limit: 1,
        });
        const promo = found.data[0];
        if (!promo) {
          return new Response(
            JSON.stringify({ error: `Invalid promo code: ${rawPromo}`, invalid_promo: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
        const coupon = typeof promo.coupon === "string" ? null : promo.coupon;
        const label = coupon?.percent_off
          ? `${coupon.percent_off}% off`
          : coupon?.amount_off
          ? `${(coupon.amount_off / 100).toFixed(2)} ${coupon.currency?.toUpperCase() ?? ""} off`
          : "Discount applied";
        appliedPromo = { code: rawPromo, label, promotion_code: promo.id };
      }
    }


    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const email = userData.user?.email;
    if (!email) throw new Error("User email not available");


    // Find or create customer
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer =
      existing.data[0] ??
      (await stripe.customers.create({
        email,
        metadata: { user_id: userData.user!.id },
      }));

    // Create subscription with trial — incomplete so we get a SetupIntent
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: TRIAL_DAYS,
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
      payment_behavior: "default_incomplete",
      expand: ["pending_setup_intent"],
      ...(appliedPromo?.promotion_code
        ? { discounts: [{ promotion_code: appliedPromo.promotion_code }] }
        : appliedPromo?.coupon
        ? { discounts: [{ coupon: appliedPromo.coupon }] }
        : {}),
      metadata: {
        plan,
        cycle,
        user_id: userData.user!.id,
        ...(appliedPromo ? { promo_code: appliedPromo.code } : {}),
      },
    });

    const setupIntent = subscription.pending_setup_intent as Stripe.SetupIntent | null;
    if (!setupIntent?.client_secret) {
      throw new Error("No setup intent returned by Stripe");
    }

    return new Response(
      JSON.stringify({
        client_secret: setupIntent.client_secret,
        subscription_id: subscription.id,
        customer_id: customer.id,
        promo: appliedPromo
          ? { code: appliedPromo.code, label: appliedPromo.label }
          : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[CREATE-SUB-SETUP] ", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
