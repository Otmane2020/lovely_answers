import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CartItem {
  priceId: string;
  quantity: number;
}

interface CheckoutRequest {
  items: CartItem[];
  cartId?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    console.log("[CREATE-CART-CHECKOUT] Starting checkout session creation");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    console.log("[CREATE-CART-CHECKOUT] User authenticated:", user.email);

    const { items, cartId }: CheckoutRequest = await req.json();

    if (!items || items.length === 0) {
      throw new Error("No items in cart");
    }

    console.log("[CREATE-CART-CHECKOUT] Items:", items);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer already exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      console.log("[CREATE-CART-CHECKOUT] Existing customer found:", customerId);
    }

    const origin = req.headers.get("origin") || "https://autopilotgeo.com";

    // Build line items
    const lineItems = items.map((item) => ({
      price: item.priceId,
      quantity: item.quantity,
    }));

    // Create checkout session with 3-day trial and promo codes enabled
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: lineItems,
      mode: "subscription",
      subscription_data: {
        trial_period_days: 3,
      },
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?subscription=success${cartId ? `&cartId=${cartId}` : ""}`,
      cancel_url: `${origin}/cart?subscription=canceled`,
      metadata: {
        cartId: cartId || "",
        userId: user.id,
      },
    });

    console.log("[CREATE-CART-CHECKOUT] Session created:", session.id);

    // Mark cart as converting (will be marked as converted by webhook)
    if (cartId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      
      await supabaseAdmin
        .from("carts")
        .update({ 
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", cartId);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[CREATE-CART-CHECKOUT] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
