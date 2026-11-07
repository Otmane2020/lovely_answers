import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
if (stripeKey.startsWith("pk_") || (!stripeKey.startsWith("sk_") && !stripeKey.startsWith("rk_"))) {
  console.error("[STRIPE-WEBHOOK] Invalid STRIPE_SECRET_KEY: expected sk_* or rk_*, never pk_*");
}

const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

const hasConfirmedPaymentMethod = (subscription: any) => Boolean(
  subscription.default_payment_method ||
  subscription.default_source ||
  subscription.pending_setup_intent?.status === "succeeded"
);

// Price → plan map (keep in sync with src/lib/stripe-products.ts)
const PRICE_MAP: Record<string, { plan: "starter" | "pro" | "agency"; cycle: "monthly" | "annual"; sites: number; articles: number }> = {
  "price_1TZI35Efti9t9nN9yj0tBl4c": { plan: "starter", cycle: "monthly", sites: 1, articles: 10 },
  "price_1TZIB3Efti9t9nN9A4NxsNsg": { plan: "starter", cycle: "annual",  sites: 1, articles: 10 },
  "price_1TZIBYEfti9t9nN9lG9JGwUa": { plan: "pro",     cycle: "monthly", sites: 3, articles: 30 },
  "price_1TZIBfEfti9t9nN9ZYClUCvF": { plan: "pro",     cycle: "annual",  sites: 3, articles: 30 },
  "price_1TZIBjEfti9t9nN9ToqTd8xu": { plan: "agency",  cycle: "monthly", sites: 10, articles: -1 },
  "price_1TZIBnEfti9t9nN9fmZiURZR": { plan: "agency",  cycle: "annual",  sites: 10, articles: -1 },
};


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  // SECURITY: never accept events without a verified signature.
  // Forged Stripe events can grant/revoke subscriptions.
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured — refusing request");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error("[stripe-webhook] Signature verification failed:", (err as Error).message);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Event received", { type: event.type, id: event.id });

    switch (event.type) {
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoiceFailed(invoice);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(subscription);
        break;
      }
      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logStep("ERROR processing webhook", { error: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  logStep("Processing paid invoice", { invoiceId: invoice.id, customerId: invoice.customer });

  // Get customer email to find user
  const customer = await stripe.customers.retrieve(invoice.customer as string);
  if (customer.deleted) {
    logStep("Customer deleted, skipping");
    return;
  }

  const email = (customer as Stripe.Customer).email;
  if (!email) {
    logStep("No email found for customer");
    return;
  }

  // Find user by email
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (!profile) {
    logStep("No user found for email", { email });
    return;
  }

  // Insert invoice record
  const { error } = await supabaseAdmin.from("invoices").upsert({
    stripe_invoice_id: invoice.id,
    user_id: profile.id,
    amount: (invoice.amount_paid || 0) / 100, // Convert from cents
    currency: invoice.currency || "usd",
    status: "paid",
    billing_date: new Date(invoice.created * 1000).toISOString(),
    pdf_url: invoice.invoice_pdf || null,
  }, { onConflict: "stripe_invoice_id" });

  if (error) {
    logStep("Error inserting invoice", { error: error.message });
  } else {
    logStep("Invoice saved successfully", { invoiceId: invoice.id, userId: profile.id });
  }
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  logStep("Processing failed invoice", { invoiceId: invoice.id });

  // Update invoice status if it exists
  const { error } = await supabaseAdmin
    .from("invoices")
    .update({ status: "failed" })
    .eq("stripe_invoice_id", invoice.id);

  if (error) {
    logStep("Error updating invoice status", { error: error.message });
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  logStep("Subscription updated", { 
    subscriptionId: subscription.id, 
    status: subscription.status,
    customerId: subscription.customer 
  });

  // Get customer email
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  if (customer.deleted) return;

  const email = (customer as Stripe.Customer).email;
  if (!email) return;

  // Find user and update credits based on subscription status
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (!profile) return;

  const isActive = subscription.status === "active" || (subscription.status === "trialing" && hasConfirmedPaymentMethod(subscription));
  const creditsTotal = subscription.status === "trialing" && isActive ? 50 : (isActive ? 500 : 0);

  await supabaseAdmin.from("credits").upsert({
    user_id: profile.id,
    credits_total: creditsTotal,
    credits_used: 0,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });


  logStep("Credits updated", { userId: profile.id, credits: creditsTotal });

  // Upsert subscriptions row (plan/cycle/limits)
  try {
    const priceId = (subscription.items?.data?.[0]?.price?.id as string) || "";
    const mapped = PRICE_MAP[priceId];
    const trialEnd = (subscription as any).trial_end
      ? new Date((subscription as any).trial_end * 1000).toISOString()
      : null;
    const periodEnd = (subscription as any).current_period_end
      ? new Date((subscription as any).current_period_end * 1000).toISOString()
      : null;

    await supabaseAdmin.from("subscriptions").upsert({
      user_id: profile.id,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      plan: mapped?.plan ?? "starter",
      cycle: mapped?.cycle ?? "monthly",
      status: subscription.status,
      trial_end: trialEnd,
      current_period_end: periodEnd,
      sites_limit: mapped?.sites ?? 1,
      articles_limit: mapped?.articles ?? 10,
      cancel_at_period_end: !!(subscription as any).cancel_at_period_end,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    logStep("Subscription upserted", { plan: mapped?.plan, cycle: mapped?.cycle, status: subscription.status });
  } catch (subErr) {
    logStep("Error upserting subscription", { error: String(subErr) });
  }

  // AUTO-UNLOCK: When subscription becomes active, unlock all locked articles
  if (isActive) {
    try {
      // Find user's project
      const { data: projects } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("user_id", profile.id)
        .limit(1);



      if (projects && projects.length > 0) {
        const projectId = projects[0].id;

        // Get locked articles
        const { data: lockedArticles } = await supabaseAdmin
          .from("articles")
          .select("id, title")
          .eq("project_id", projectId)
          .eq("status", "locked");

        if (lockedArticles && lockedArticles.length > 0) {
          logStep("Found locked articles to unlock", { count: lockedArticles.length, projectId });

          // Update status from locked to scheduled
          const articleIds = lockedArticles.map(a => a.id);
          await supabaseAdmin
            .from("articles")
            .update({ status: "scheduled" })
            .in("id", articleIds);

          // Trigger generation for each article
          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

          for (const article of lockedArticles) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/generate-aeo-article`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({ articleId: article.id }),
              });
              logStep("Triggered generation for article", { articleId: article.id });
            } catch (genErr) {
              logStep("Error triggering generation", { articleId: article.id, error: String(genErr) });
            }
          }

          logStep("Unlocked articles after subscription activation", { count: lockedArticles.length });
        }
      }
    } catch (unlockErr) {
      logStep("Error in auto-unlock process", { error: String(unlockErr) });
    }

    // SHOPIFY: if user came via Shopify OAuth, kick off product import + AI generation
    try {
      const { data: install } = await supabaseAdmin
        .from("shopify_installs")
        .select("shop")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (install?.shop) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const auth = { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` };
        // 1) Import products (idempotent) + mark integration connected
        const impRes = await fetch(`${supabaseUrl}/functions/v1/shopify-import-products`, {
          method: "POST", headers: auth, body: JSON.stringify({ shop: install.shop, userId: profile.id }),
        });
        const impJson = await impRes.json().catch(() => ({}));
        logStep("Shopify import triggered", impJson);
        const pid = impJson?.projectId;
        // 2) Fetch shop context (language, address, pages, product URLs)
        if (pid) {
          fetch(`${supabaseUrl}/functions/v1/shopify-fetch-context`, {
            method: "POST", headers: auth, body: JSON.stringify({ shop: install.shop, userId: profile.id, projectId: pid }),
          }).catch((e) => logStep("shopify-fetch-context trigger error", { error: String(e) }));
          // 3) Flag onboarding as needed so ThankYou can redirect merchant to /wizard
          await supabaseAdmin.from("projects").update({
            needs_onboarding: true, source: "shopify_oauth",
          }).eq("id", pid);
          // 4) Generate AI for imported products + fill 30-day planning
          fetch(`${supabaseUrl}/functions/v1/auto-generate-shopping`, {
            method: "POST", headers: auth, body: JSON.stringify({ projectId: pid }),
          }).catch((e) => logStep("auto-generate-shopping trigger error", { error: String(e) }));
        }
      }
    } catch (shopErr) {
      logStep("Shopify post-payment automation error", { error: String(shopErr) });
    }
  }
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  logStep("Subscription canceled", { subscriptionId: subscription.id });

  const customer = await stripe.customers.retrieve(subscription.customer as string);
  if (customer.deleted) return;

  const email = (customer as Stripe.Customer).email;
  if (!email) return;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (!profile) return;

  // Reset credits to 0 on cancellation
  await supabaseAdmin.from("credits").upsert({
    user_id: profile.id,
    credits_total: 0,
    credits_used: 0,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });

  // Mark subscription canceled
  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("user_id", profile.id);

  logStep("Credits reset for canceled subscription", { userId: profile.id });
}

