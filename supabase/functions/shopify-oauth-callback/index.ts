// Shopify OAuth - Callback.
// Shopify redirects here with ?code&shop&state&hmac after merchant approves.
// We verify HMAC + state, exchange code -> access_token, upsert the install,
// auto-create/sign-in a Supabase user with email {shop}@shopify-autopilot.com,
// then redirect the merchant to /checkout (3-day free trial).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const APP_ORIGIN = "https://autopilotgeo.com";

function isValidShop(shop: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

async function verifyHmac(query: URLSearchParams, secret: string) {
  const received = query.get("hmac");
  if (!received) return false;
  const params: string[] = [];
  const sorted = [...query.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [k, v] of sorted) params.push(`${k}=${v}`);
  const message = params.join("&");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === received;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const shop = (url.searchParams.get("shop") || "").toLowerCase();
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!shop || !isValidShop(shop) || !code || !state) {
      return new Response("Invalid callback parameters", { status: 400 });
    }

    const clientId = Deno.env.get("SHOPIFY_CLIENT_ID")!;
    // The Shopify API secret was saved by the user under SHOPIFY_ACCESS_TOKEN.
    const clientSecret =
      Deno.env.get("SHOPIFY_API_SECRET") || Deno.env.get("SHOPIFY_ACCESS_TOKEN")!;

    // Verify HMAC
    const ok = await verifyHmac(url.searchParams, clientSecret);
    if (!ok) {
      console.error("[shopify-oauth-callback] HMAC verification failed");
      return new Response("HMAC verification failed", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify state nonce
    const { data: stateRow } = await supabase
      .from("shopify_oauth_states")
      .select("shop")
      .eq("state", state)
      .maybeSingle();
    if (!stateRow || stateRow.shop !== shop) {
      return new Response("Invalid state", { status: 401 });
    }
    await supabase.from("shopify_oauth_states").delete().eq("state", state);

    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("[shopify-oauth-callback] token exchange failed:", t);
      return new Response("Token exchange failed", { status: 502 });
    }
    const tokenJson = await tokenRes.json();
    const accessToken: string = tokenJson.access_token;
    const scope: string = tokenJson.scope || "";

    // Auto-create the merchant user
    const shopName = shop.replace(".myshopify.com", "");
    const email = `${shopName}@shopify-autopilot.com`;
    const password = crypto.randomUUID() + crypto.randomUUID();

    // Try create; if already exists, look them up.
    let userId: string | null = null;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { shopify_shop: shop, source: "shopify_oauth" },
    });
    if (created?.user) {
      userId = created.user.id;
    } else if (createErr) {
      // User probably already exists → find them
      const { data: list } = await supabase.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === email);
      if (existing) userId = existing.id;
    }

    // Upsert install record
    await supabase.from("shopify_installs").upsert(
      {
        shop,
        access_token: accessToken,
        scope,
        user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop" }
    );
    // Fire-and-forget: import Shopify products + fetch shop context (language, pages, product URLs)
    try {
      const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
      const auth = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      };
      const payload = JSON.stringify({ shop, userId });
      fetch(`${base}/shopify-import-products`, { method: "POST", headers: auth, body: payload })
        .catch((e) => console.error("[shopify-oauth-callback] import trigger error:", e));
      // fetch shop context in parallel (populates generation_settings.shopify_shop_info etc.)
      fetch(`${base}/shopify-fetch-context`, { method: "POST", headers: auth, body: payload })
        .catch((e) => console.error("[shopify-oauth-callback] context trigger error:", e));
      // mark the user's project(s) as needing onboarding after payment
      if (userId) {
        await supabase.from("projects")
          .update({ needs_onboarding: true, source: "shopify_oauth" })
          .eq("user_id", userId);
      }
    } catch (e) {
      console.error("[shopify-oauth-callback] post-install trigger failed:", e);
    }


    // Generate a magic link so the merchant lands signed-in on /checkout
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${APP_ORIGIN}/checkout?plan=pro&cycle=annual` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[shopify-oauth-callback] magic link failed:", linkErr);
      return Response.redirect(`${APP_ORIGIN}/auth?shopify=connected`, 302);
    }

    return Response.redirect(linkData.properties.action_link, 302);
  } catch (e) {
    console.error("[shopify-oauth-callback] error:", e);
    return Response.redirect(`${APP_ORIGIN}/?shopify_error=callback`, 302);
  }
});
