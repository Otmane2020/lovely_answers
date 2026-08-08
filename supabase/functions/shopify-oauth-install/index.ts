// Shopify OAuth - Install entry point.
// Shopify calls this URL when a merchant clicks "Install" (or lands on App URL).
// We verify the shop domain, generate a state nonce, and redirect to the
// Shopify authorize page. Callback URL points to shopify-oauth-callback.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SCOPES = "read_products,write_content,read_customers,write_customers";
const APP_ORIGIN = "https://autopilotgeo.com";

function isValidShop(shop: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const shop = (url.searchParams.get("shop") || "").toLowerCase();
    if (!shop || !isValidShop(shop)) {
      return new Response("Invalid or missing shop parameter", { status: 400 });
    }

    const clientId = Deno.env.get("SHOPIFY_CLIENT_ID")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Persist a state nonce for CSRF protection
    const state = crypto.randomUUID();
    await supabase.from("shopify_oauth_states").insert({ state, shop });

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-oauth-callback`;
    const authorizeUrl =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&grant_options[]=`;

    return Response.redirect(authorizeUrl, 302);
  } catch (e) {
    console.error("[shopify-oauth-install] error:", e);
    return Response.redirect(`${APP_ORIGIN}/?shopify_error=install`, 302);
  }
});
