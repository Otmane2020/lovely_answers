// Import products from a connected Shopify store into shopping_products,
// upsert a shopping_feeds row and mark the shopify integration as connected.
// Callable with either { shop } or { userId, projectId? }.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_VERSION = "2025-01";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    let { shop, userId, projectId } = body as {
      shop?: string; userId?: string; projectId?: string;
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve install (shop → user or user → shop)
    let install: any = null;
    if (shop) {
      const { data } = await supabase.from("shopify_installs").select("*").eq("shop", shop).maybeSingle();
      install = data;
    } else if (userId) {
      const { data } = await supabase.from("shopify_installs").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      install = data;
    }
    if (!install?.access_token) {
      return new Response(JSON.stringify({ error: "No Shopify install found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    shop = install.shop;
    userId = install.user_id || userId;

    // Resolve / create project for this user
    if (!projectId && userId) {
      const { data: projects } = await supabase
        .from("projects").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      if (projects && projects.length > 0) {
        projectId = projects[0].id;
      } else {
        const shopUrl = `https://${shop}`;
        const { data: created, error: pErr } = await supabase
          .from("projects")
          .insert({
            user_id: userId,
            name: shop!.replace(".myshopify.com", ""),
            website_url: shopUrl,
            domain: shop,
            language: "en",
            is_active: true,
          })
          .select("id").single();
        if (pErr) throw pErr;
        projectId = created.id;
      }
    }
    if (!projectId) throw new Error("No projectId resolved");

    // Fetch products (paginated)
    const allProducts: any[] = [];
    let pageInfo: string | null = null;
    do {
      const url = pageInfo
        ? `https://${shop}/admin/api/${API_VERSION}/products.json?limit=250&page_info=${encodeURIComponent(pageInfo)}`
        : `https://${shop}/admin/api/${API_VERSION}/products.json?limit=250`;
      const res = await fetch(url, {
        headers: { "X-Shopify-Access-Token": install.access_token, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Shopify products fetch failed: ${res.status} ${t.slice(0, 200)}`);
      }
      const json = await res.json();
      if (Array.isArray(json.products)) allProducts.push(...json.products);
      // Parse Link header for pagination
      const link = res.headers.get("link") || res.headers.get("Link");
      pageInfo = null;
      if (link) {
        const m = link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
        if (m) pageInfo = decodeURIComponent(m[1]);
      }
    } while (pageInfo && allProducts.length < 5000);

    if (allProducts.length === 0) {
      return new Response(JSON.stringify({ success: true, imported: 0, message: "No products in shop" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing feed_item_ids to avoid duplicates
    const { data: existing } = await supabase
      .from("shopping_products")
      .select("feed_item_id")
      .eq("project_id", projectId);
    const existingIds = new Set((existing || []).map((r: any) => r.feed_item_id).filter(Boolean));

    const rows = allProducts
      .filter((p) => !existingIds.has(String(p.id)))
      .map((p: any) => {
        const variant = Array.isArray(p.variants) && p.variants[0] ? p.variants[0] : {};
        const image = Array.isArray(p.images) && p.images[0] ? p.images[0].src : (p.image?.src || null);
        const handle = p.handle || "";
        return {
          project_id: projectId,
          title: p.title || "Untitled Product",
          description: (p.body_html || "").replace(/<[^>]*>/g, "").trim() || null,
          price: variant.price ? parseFloat(variant.price) : null,
          currency: "USD",
          image_url: image,
          product_url: handle ? `https://${shop}/products/${handle}` : null,
          brand: p.vendor || null,
          category: p.product_type || null,
          availability: variant.inventory_quantity > 0 ? "in stock" : "out of stock",
          condition: "new",
          gtin: variant.barcode || null,
          mpn: variant.sku || null,
          feed_item_id: String(p.id),
          language: "en",
          status: "imported",
        };
      });

    let inserted = 0;
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("shopping_products").insert(rows);
      if (insErr) throw insErr;
      inserted = rows.length;
    }

    // Upsert shopping_feeds row (no unique constraint → manual check)
    const { data: existingFeed } = await supabase
      .from("shopping_feeds").select("id").eq("project_id", projectId).eq("feed_type", "shopify").maybeSingle();
    const feedPayload = {
      project_id: projectId,
      feed_url: `https://${shop}`,
      feed_type: "shopify",
      last_synced_at: new Date().toISOString(),
      product_count: allProducts.length,
      status: "active",
    };
    if (existingFeed?.id) {
      await supabase.from("shopping_feeds").update(feedPayload).eq("id", existingFeed.id);
    } else {
      await supabase.from("shopping_feeds").insert(feedPayload);
    }

    // Mark shopify integration as connected
    const { data: intg } = await supabase
      .from("integrations")
      .select("id")
      .eq("project_id", projectId)
      .eq("platform", "shopify")
      .maybeSingle();
    if (intg?.id) {
      await supabase.from("integrations").update({
        is_connected: true,
        config: { shop, access_token: install.access_token },
        updated_at: new Date().toISOString(),
      }).eq("id", intg.id);
    } else {
      await supabase.from("integrations").insert({
        project_id: projectId,
        platform: "shopify",
        is_connected: true,
        config: { shop, access_token: install.access_token },
      });
    }

    return new Response(JSON.stringify({
      success: true, projectId, shop, totalFetched: allProducts.length, imported: inserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[shopify-import-products]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
