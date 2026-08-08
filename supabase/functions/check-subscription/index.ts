import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

const hasConfirmedPaymentMethod = (sub: any) => {
  const setupIntent = sub.pending_setup_intent;
  return Boolean(
    sub.default_payment_method ||
    sub.default_source ||
    setupIntent?.status === "succeeded"
  );
};

// Price → plan map (keep in sync with src/lib/stripe-products.ts)
type PlanCaps = {
  prioritySEO: boolean; allCms: boolean; planningUnlocked: boolean;
  whiteLabel: boolean; multiClient: boolean; slackSupport: boolean; competitorMonitoring: boolean;
};
const STARTER_CAPS: PlanCaps = { prioritySEO: false, allCms: false, planningUnlocked: false, whiteLabel: false, multiClient: false, slackSupport: false, competitorMonitoring: false };
const PRO_CAPS: PlanCaps     = { prioritySEO: true,  allCms: true,  planningUnlocked: true,  whiteLabel: false, multiClient: false, slackSupport: false, competitorMonitoring: true  };
const AGENCY_CAPS: PlanCaps  = { prioritySEO: true,  allCms: true,  planningUnlocked: true,  whiteLabel: true,  multiClient: true,  slackSupport: true,  competitorMonitoring: true  };

const PRICE_MAP: Record<string, { plan: "starter" | "pro" | "agency"; cycle: "monthly" | "annual"; sites: number; articles: number; caps: PlanCaps }> = {
  "price_1TZI35Efti9t9nN9yj0tBl4c": { plan: "starter", cycle: "monthly", sites: 1,  articles: 10, caps: STARTER_CAPS },
  "price_1TZIB3Efti9t9nN9A4NxsNsg": { plan: "starter", cycle: "annual",  sites: 1,  articles: 10, caps: STARTER_CAPS },
  "price_1TZIBYEfti9t9nN9lG9JGwUa": { plan: "pro",     cycle: "monthly", sites: 3,  articles: 30, caps: PRO_CAPS     },
  "price_1TZIBfEfti9t9nN9ZYClUCvF": { plan: "pro",     cycle: "annual",  sites: 3,  articles: 30, caps: PRO_CAPS     },
  "price_1TZIBjEfti9t9nN9ToqTd8xu": { plan: "agency",  cycle: "monthly", sites: 10, articles: -1, caps: AGENCY_CAPS  },
  "price_1TZIBnEfti9t9nN9fmZiURZR": { plan: "agency",  cycle: "annual",  sites: 10, articles: -1, caps: AGENCY_CAPS  },
};
const normalizeLimit = (n: number | null | undefined): number | null =>
  (n == null || n < 0) ? null : n;


// VIP emails with permanent unlimited access

async function triggerUnlockIfNeeded(supabaseClient: any, userId: string, authHeader: string) {
  const { data: userProjects } = await supabaseClient
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (!userProjects || userProjects.length === 0) return;

  const projectId = userProjects[0].id;
  const { data: lockedArticles } = await supabaseClient
    .from("articles")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "locked")
    .limit(1);

  const { data: lockedAnswers } = await supabaseClient
    .from("answers")
    .select("id")
    .eq("project_id", projectId)
    .eq("answer", "Content locked — subscribe to unlock.")
    .limit(1);

  const hasLockedContent = (lockedArticles && lockedArticles.length > 0) ||
                            (lockedAnswers && lockedAnswers.length > 0);

  if (!hasLockedContent) return;

  logStep("User has locked content - triggering unlock", { projectId });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // Fire-and-forget — unlock can take >60s and would time out check-subscription (150s limit)
  fetch(`${supabaseUrl}/functions/v1/unlock-articles`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, projectId }),
  }).catch((e) => logStep("Unlock trigger error (ignored)", { error: String(e) }));
}

async function triggerGeoIfNeeded(supabaseClient: any, userId: string) {
  const { data: userProjects } = await supabaseClient
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (!userProjects || userProjects.length === 0) return;
  const projectId = userProjects[0].id;

  const now = new Date();
  const in30 = new Date();
  in30.setDate(now.getDate() + 30);

  const { count } = await supabaseClient
    .from("geo_contents")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gte("scheduled_date", now.toISOString())
    .lte("scheduled_date", in30.toISOString());

  if ((count || 0) >= 30) return;

  logStep("User needs GEO planning - triggering generation", { projectId, count: count || 0 });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  fetch(`${supabaseUrl}/functions/v1/generate-30-gso-contents`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projectId }),
  }).catch((e) => logStep("GEO trigger error (ignored)", { error: String(e) }));
}

const VIP_EMAILS = [
  "oben.rockman@gmail.com",
  "oben.rocman@gmail.com",
  "expertt.webdev@gmail.com",
  "otmane.benyahya@sweetdeco.com",
  "starlinko.app@gmail.com",
  "support@meubleoccasion.com",
  "support@audit-aeo.com",
  "contact@webify-app.com",
  "canapedeluxe.com@gmail.com",
  "clipmotion.ai@gmail.com",
  "floresclarissausa@gmail.com",
  "lea2002023@gmail.com",
  "support@ranki.ai",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("No authorization header - returning unsubscribed");
      return new Response(JSON.stringify({ 
        subscribed: false,
        trial: false,
        product_id: null,
        subscription_end: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    // Handle auth errors gracefully (e.g., after logout)
    if (userError || !userData.user?.email) {
      logStep("Auth error or no user - returning unsubscribed", { error: userError?.message });
      return new Response(JSON.stringify({ 
        subscribed: false,
        trial: false,
        product_id: null,
        subscription_end: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Check if user is VIP (permanent unlimited access)
    const userEmail = user.email || "";
    if (VIP_EMAILS.includes(userEmail.toLowerCase())) {
      logStep("VIP user detected - granting unlimited access", { email: userEmail });
      
      // Give VIP users max credits
      await supabaseClient
        .from("credits")
        .upsert({
          user_id: user.id,
          credits_total: 99999,
          credits_used: 0,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

      await triggerUnlockIfNeeded(supabaseClient, user.id, req.headers.get("Authorization") || "");
      await triggerGeoIfNeeded(supabaseClient, user.id);

      return new Response(JSON.stringify({
        subscribed: true,
        trial: false,
        product_id: "vip_unlimited",
        subscription_end: "2099-12-31T23:59:59.999Z",
        credits_total: 99999,
        plan: "agency",
        cycle: "annual",
        sites_limit: null,
        articles_limit: null,
        features: AGENCY_CAPS,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return new Response(JSON.stringify({ 
        subscribed: false,
        trial: false,
        product_id: null,
        subscription_end: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const body = await req.json().catch(() => ({}));
    const requestedSubscriptionId = typeof body?.subscription_id === "string" ? body.subscription_id : null;

    // Check for active or trialing subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
      expand: ["data.pending_setup_intent", "data.default_payment_method"],
    });

    logStep("Fetched subscriptions", { 
      count: subscriptions.data.length,
      statuses: subscriptions.data.map((s: any) => s.status)
    });

    const activeOrTrialingSub = subscriptions.data.find((sub: any) => {
      const isAccessible = sub.status === "active" || (sub.status === "trialing" && hasConfirmedPaymentMethod(sub));
      if (!isAccessible) return false;
      return requestedSubscriptionId ? sub.id === requestedSubscriptionId : true;
    });

    if (!activeOrTrialingSub) {
      logStep("No active subscription found");
      return new Response(JSON.stringify({ 
        subscribed: false,
        trial: false,
        product_id: null,
        subscription_end: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Access subscription properties directly
    const sub = activeOrTrialingSub as any;
    const isTrialing = sub.status === "trialing";
    const productId = sub.items?.data?.[0]?.price?.product as string || null;
    
    // Parse subscription end date - handle both trial_end and current_period_end
    let subscriptionEnd: string | null = null;
    const endTimestamp = isTrialing ? sub.trial_end : sub.current_period_end;
    
    if (endTimestamp && typeof endTimestamp === 'number') {
      try {
        subscriptionEnd = new Date(endTimestamp * 1000).toISOString();
      } catch (dateError) {
        logStep("Error parsing subscription end date", { error: String(dateError) });
      }
    }

    logStep("Active subscription found", { 
      subscriptionId: sub.id, 
      status: sub.status,
      isTrialing,
      productId,
      endDate: subscriptionEnd,
      rawEndTimestamp: endTimestamp
    });

    // Update credits based on subscription
    const creditsTotal = isTrialing ? 50 : 500; // 50 for trial, 500 for paid
    
    await supabaseClient
      .from("credits")
      .upsert({
        user_id: user.id,
        credits_total: creditsTotal,
        credits_used: 0,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });

    logStep("Credits updated", { creditsTotal });

    // Upsert plan/limits into subscriptions table
    try {
      const priceId = (sub.items?.data?.[0]?.price?.id as string) || "";
      const mapped = PRICE_MAP[priceId];
      await supabaseClient.from("subscriptions").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        plan: mapped?.plan ?? "starter",
        cycle: mapped?.cycle ?? "monthly",
        status: sub.status,
        trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        sites_limit: mapped?.sites ?? 1,
        articles_limit: mapped?.articles ?? 10,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      logStep("Subscription row upserted", { plan: mapped?.plan, cycle: mapped?.cycle });
    } catch (subErr) {
      logStep("Error upserting subscription row", { error: String(subErr) });
    }


    // Paid/trial users may already have placeholder locked content generated before checkout.
    // Trigger the unlock/generation job here too, not only for VIP users.
    await triggerUnlockIfNeeded(supabaseClient, user.id, authHeader);
    await triggerGeoIfNeeded(supabaseClient, user.id);

    const mappedFinal = PRICE_MAP[(sub.items?.data?.[0]?.price?.id as string) || ""];
    return new Response(JSON.stringify({
      subscribed: true,
      trial: isTrialing,
      product_id: productId,
      subscription_end: subscriptionEnd,
      credits_total: creditsTotal,
      plan: mappedFinal?.plan ?? null,
      cycle: mappedFinal?.cycle ?? null,
      sites_limit: normalizeLimit(mappedFinal?.sites ?? null),
      articles_limit: normalizeLimit(mappedFinal?.articles ?? null),
      features: mappedFinal?.caps ?? STARTER_CAPS,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });


  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
