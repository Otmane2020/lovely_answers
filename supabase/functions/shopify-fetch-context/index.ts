// Fetch Shopify shop info + pages + products index and store them in
// generation_settings so every AI generator can localize + link internally.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_VERSION = "2025-01";

async function shopifyGet(shop: string, token: string, path: string) {
  const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/${path}`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`Shopify ${path} ${r.status}: ${await r.text().then(t=>t.slice(0,200))}`);
  return r.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { shop, projectId, userId } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve install
    let install: any = null;
    if (shop) {
      const { data } = await supabase.from("shopify_installs").select("*").eq("shop", shop).maybeSingle();
      install = data;
    } else if (userId) {
      const { data } = await supabase.from("shopify_installs")
        .select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      install = data;
    }
    if (!install?.access_token) {
      return new Response(JSON.stringify({ error: "No Shopify install found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resolvedShop = install.shop;
    const token = install.access_token;

    // Resolve projectId if not provided
    let pid = projectId;
    if (!pid) {
      const { data: projects } = await supabase.from("projects")
        .select("id").eq("user_id", install.user_id).order("created_at", { ascending: false }).limit(1);
      pid = projects?.[0]?.id;
    }
    if (!pid) throw new Error("No projectId resolved");

    // Fetch shop info
    const shopJson = await shopifyGet(resolvedShop, token, "shop.json");
    const s = shopJson.shop || {};
    const shopInfo = {
      name: s.name,
      domain: s.domain,
      address1: s.address1,
      city: s.city,
      country: s.country_name,
      currency: s.currency,
      primary_locale: s.primary_locale,
      email: s.email,
    };

    // Fetch pages (top 20)
    let pages: any[] = [];
    try {
      const pagesJson = await shopifyGet(resolvedShop, token, "pages.json?limit=20");
      pages = (pagesJson.pages || []).map((p: any) => ({
        title: p.title,
        handle: p.handle,
        body_text: (p.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
      }));
    } catch (e) { console.warn("[shopify-fetch-context] pages error:", e); }

    // Fetch products (index only — title/handle/type/description)
    const products: any[] = [];
    try {
      const prodJson = await shopifyGet(resolvedShop, token,
        "products.json?limit=100&fields=id,title,handle,product_type,body_html");
      for (const p of (prodJson.products || [])) {
        products.push({
          title: p.title,
          handle: p.handle,
          url: `https://${resolvedShop}/products/${p.handle}`,
          category: p.product_type || null,
          description: (p.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200),
        });
      }
    } catch (e) { console.warn("[shopify-fetch-context] products error:", e); }

    // Upsert into generation_settings
    const { data: existing } = await supabase.from("generation_settings")
      .select("id, website_url").eq("project_id", pid).maybeSingle();

    const patch = {
      shopify_shop_info: shopInfo,
      shopify_pages: pages,
      shopify_products_index: products,
      language: shopInfo.primary_locale || undefined,
    };

    if (existing?.id) {
      await supabase.from("generation_settings").update(patch).eq("project_id", pid);
    } else {
      await supabase.from("generation_settings").insert({
        project_id: pid,
        website_url: `https://${resolvedShop}`,
        language: shopInfo.primary_locale || "en",
        brand_name: shopInfo.name || resolvedShop.replace(".myshopify.com", ""),
        ...patch,
      });
    }

    // Also update the project language + brand if set to defaults
    await supabase.from("projects").update({
      language: shopInfo.primary_locale || "en",
      brand_name: shopInfo.name || null,
    }).eq("id", pid);

    return new Response(JSON.stringify({
      success: true, projectId: pid, shop: resolvedShop,
      counts: { pages: pages.length, products: products.length },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[shopify-fetch-context]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
