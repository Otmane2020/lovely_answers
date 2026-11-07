import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date().toISOString().split("T")[0];

    // Get all scheduled entries for today that haven't been published
    const { data: todayEntries, error: fetchError } = await supabase
      .from("shopping_planning")
      .select("*, product:shopping_products(*)")
      .eq("scheduled_date", today)
      .eq("published", false);

    if (fetchError) throw fetchError;

    if (!todayEntries || todayEntries.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No products scheduled for today",
        published: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let publishedCount = 0;

    for (const entry of todayEntries) {
      const product = entry.product;
      if (!product || !product.ai_title) continue;

      // Get project info for CMS publishing
      const { data: project } = await supabase
        .from("projects")
        .select("id, website_url, language, brand_name")
        .eq("id", entry.project_id)
        .single();

      if (!project) continue;

      // Get integration for publishing
      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("project_id", entry.project_id)
        .eq("is_connected", true)
        .limit(1)
        .single();

      // Build article HTML from product AI content
      const faqHtml = Array.isArray(product.ai_faq) && product.ai_faq.length > 0
        ? `<h2>Questions fréquentes</h2>${product.ai_faq.map((f: any) => 
            `<h3>${f.question}</h3><p>${f.answer}</p>`
          ).join("")}`
        : "";

      const schemaScript = product.ai_schema_markup
        ? `<script type="application/ld+json">${JSON.stringify(product.ai_schema_markup)}</script>`
        : "";

      const htmlContent = `
        <article>
          ${product.ai_description ? `<p>${product.ai_description}</p>` : ""}
          ${product.price ? `<p><strong>Prix : ${product.price} ${product.currency || "EUR"}</strong></p>` : ""}
          ${faqHtml}
          ${schemaScript}
        </article>
      `.trim();

      const slug = (product.ai_title || product.title)
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Publish: use Shopify Admin API directly if shopify integration, else generic cms-publish
      let publishedUrl: string | null = null;
      if (integration?.platform === "shopify") {
        try {
          const { data: shopRes, error: shopErr } = await supabase.functions.invoke("shopify-publish-article", {
            body: {
              projectId: entry.project_id,
              title: product.ai_title || product.title,
              bodyHtml: htmlContent,
              handle: slug,
              metaDescription: product.ai_description?.substring(0, 160),
              tags: ["AutoPilotGEO", product.category].filter(Boolean).join(","),
            },
          });
          if (shopErr) console.error("Shopify publish error:", shopErr);
          if (shopRes?.url) publishedUrl = shopRes.url;
        } catch (e) {
          console.error("Shopify publish failed:", e);
        }
      } else if (integration) {
        try {
          const { error: cmsError } = await supabase.functions.invoke("cms-publish", {
            body: {
              projectId: entry.project_id,
              title: product.ai_title || product.title,
              content: htmlContent,
              slug,
              metaDescription: product.ai_description?.substring(0, 160),
            },
          });
          if (cmsError) console.error("CMS publish error:", cmsError);
        } catch (e) {
          console.error("CMS publish failed:", e);
        }
      }

      // Update product status
      await supabase
        .from("shopping_products")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          published_url: publishedUrl || `/${slug}`,
        })
        .eq("id", product.id);

      // Mark planning entry as published
      await supabase
        .from("shopping_planning")
        .update({ published: true, published_at: new Date().toISOString() })
        .eq("id", entry.id);

      publishedCount++;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      published: publishedCount,
      total: todayEntries.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
