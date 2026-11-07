// Verifies the user's payment via Stripe and unlocks all locked content if active.
// Can be called from the frontend right after checkout to force-sync the state.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-UNLOCK] ${step}${d}`);
};

const VIP_USERS = new Set([
  "floresclarissausa@gmail.com",
  "lea2002023@gmail.com",
  "oben.rockman@gmail.com",
  "support@ranki.ai",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) throw new Error(`Auth error: ${userErr.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("Email not available");
    log("Authenticated", { email: user.email });

    let isActive = false;
    let productId: string | null = null;
    let subscriptionEnd: string | null = null;

    if (VIP_USERS.has(user.email.toLowerCase())) {
      isActive = true;
      productId = "vip_unlimited";
      subscriptionEnd = "2099-12-31T23:59:59.999Z";
      log("VIP user", { email: user.email });
    } else {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });

      if (customers.data.length === 0) {
        log("No Stripe customer");
      } else {
        const customerId = customers.data[0].id;
        // Look at all (active + trialing + past_due) to be tolerant during propagation
        const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 5 });
        const active = subs.data.find((s) => s.status === "active" || s.status === "trialing");
        if (active) {
          isActive = true;
          productId = (active.items.data[0]?.price.product as string) || null;
          subscriptionEnd = (active as any).current_period_end
            ? new Date((active as any).current_period_end * 1000).toISOString()
            : null;
          log("Active subscription", { id: active.id, status: active.status });
        } else {
          log("No active sub", { count: subs.data.length, statuses: subs.data.map((s) => s.status) });
        }
      }
    }

    let unlockedArticles = 0;
    let unlockedGeo = 0;

    if (isActive) {
      // Refresh credits
      await supabase.from("credits").upsert(
        { user_id: user.id, credits_total: 500, credits_used: 0, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

      // Find user projects
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id);

      const projectIds = (projects || []).map((p: any) => p.id);

      if (projectIds.length > 0) {
        // Unlock locked articles -> scheduled
        const { data: arts } = await supabase
          .from("articles")
          .select("id")
          .in("project_id", projectIds)
          .eq("status", "locked");
        if (arts && arts.length > 0) {
          await supabase
            .from("articles")
            .update({ status: "scheduled" })
            .in("id", arts.map((a: any) => a.id));
          unlockedArticles = arts.length;
        }

        // Unlock locked geo_contents if table+column exists
        try {
          const { data: geos } = await supabase
            .from("geo_contents")
            .select("id")
            .in("project_id", projectIds)
            .eq("status", "locked");
          if (geos && geos.length > 0) {
            await supabase
              .from("geo_contents")
              .update({ status: "scheduled" })
              .in("id", geos.map((g: any) => g.id));
            unlockedGeo = geos.length;
          }
        } catch (e) {
          log("geo_contents unlock skipped", { err: String(e) });
        }
      }

      log("Unlocked", { articles: unlockedArticles, geo: unlockedGeo });
    }

    return new Response(
      JSON.stringify({
        subscribed: isActive,
        product_id: productId,
        subscription_end: subscriptionEnd,
        unlocked_articles: unlockedArticles,
        unlocked_geo: unlockedGeo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg, subscribed: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
