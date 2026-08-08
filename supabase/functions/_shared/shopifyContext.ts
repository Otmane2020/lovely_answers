// Shared helper: load Shopify shop context for a project so AI generators
// (AEO / GEO / SEO / Shopping) can localize content and add internal links.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ShopifyShopInfo {
  name?: string;
  domain?: string;
  address1?: string;
  city?: string;
  country?: string;
  currency?: string;
  primary_locale?: string;
  email?: string;
}

export interface ShopifyProductLite {
  title: string;
  handle: string;
  url: string;
  category?: string;
  description?: string;
}

export interface ShopifyPageLite {
  title: string;
  handle: string;
  body_text?: string;
}

export interface ShopifyContext {
  hasShopify: boolean;
  shop?: ShopifyShopInfo;
  pages?: ShopifyPageLite[];
  products?: ShopifyProductLite[];
  language?: string;
}

export async function loadShopifyContext(
  supabaseUrl: string,
  serviceRoleKey: string,
  projectId: string,
): Promise<ShopifyContext> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: gs } = await supabase
    .from("generation_settings")
    .select("shopify_shop_info, shopify_pages, shopify_products_index, language")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!gs || !gs.shopify_shop_info) {
    return { hasShopify: false };
  }

  const shop = (gs.shopify_shop_info || {}) as ShopifyShopInfo;
  const pages = Array.isArray(gs.shopify_pages) ? (gs.shopify_pages as ShopifyPageLite[]) : [];
  const products = Array.isArray(gs.shopify_products_index)
    ? (gs.shopify_products_index as ShopifyProductLite[])
    : [];

  return {
    hasShopify: true,
    shop,
    pages,
    products,
    language: shop.primary_locale || gs.language || undefined,
  };
}

// Produce a compact system-prompt block to inject into AI generators.
// Keeps token cost low by trimming to top N products.
export function shopifyContextPrompt(ctx: ShopifyContext, maxProducts = 20): string {
  if (!ctx.hasShopify || !ctx.shop) return "";
  const s = ctx.shop;
  const products = (ctx.products || []).slice(0, maxProducts);
  const pages = (ctx.pages || []).slice(0, 8);

  const productLines = products
    .map(
      (p) =>
        `- ${p.title}${p.category ? ` (${p.category})` : ""} → ${p.url}`,
    )
    .join("\n");

  const pageLines = pages.map((p) => `- ${p.title} (/${p.handle})`).join("\n");

  return `
SHOPIFY STORE CONTEXT (use this to localize content and add internal links):
- Store name: ${s.name || "N/A"}
- Address: ${[s.address1, s.city, s.country].filter(Boolean).join(", ") || "N/A"}
- Currency: ${s.currency || "N/A"}
- Primary language/locale: ${s.primary_locale || ctx.language || "en"}
- All generated content MUST be written in ${s.primary_locale || ctx.language || "en"} and reference the store name naturally.
- When relevant, insert plain HTML links to the store's products from the list below.

STORE PAGES:
${pageLines || "(none)"}

TOP PRODUCTS (use these exact URLs when linking):
${productLines || "(none)"}
`.trim();
}
