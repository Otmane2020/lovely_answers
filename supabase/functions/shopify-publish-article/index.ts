// Publish an article to a connected Shopify store using the Admin REST API.
// Called by publish-shopping-products and cms-publish (shopify branch).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_VERSION = "2025-01";

async function getOrCreateDefaultBlog(shop: string, token: string): Promise<number> {
  const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/blogs.json`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`blogs.json ${r.status}: ${await r.text()}`);
  const j = await r.json();
  if (j.blogs && j.blogs.length > 0) return j.blogs[0].id;
  // Create default blog
  const c = await fetch(`https://${shop}/admin/api/${API_VERSION}/blogs.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ blog: { title: "News", commentable: "no" } }),
  });
  if (!c.ok) throw new Error(`create blog ${c.status}: ${await c.text()}`);
  const cj = await c.json();
  return cj.blog.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      projectId, title, content, html, bodyHtml,
      tags, handle, metaDescription, author,
    } = await req.json();

    const body_html = bodyHtml || html || content;
    if (!projectId || !title || !body_html) {
      return new Response(JSON.stringify({ error: "projectId, title, content required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve shop + access token via integrations or fallback to shopify_installs via project user
    const { data: integration } = await supabase
      .from("integrations")
      .select("config")
      .eq("project_id", projectId)
      .eq("platform", "shopify")
      .maybeSingle();

    let shop: string | undefined = integration?.config?.shop;
    let token: string | undefined = integration?.config?.access_token;

    if (!shop || !token) {
      const { data: project } = await supabase.from("projects").select("user_id").eq("id", projectId).maybeSingle();
      if (project?.user_id) {
        const { data: install } = await supabase
          .from("shopify_installs")
          .select("shop, access_token")
          .eq("user_id", project.user_id)
          .order("updated_at", { ascending: false })
          .limit(1).maybeSingle();
        shop = install?.shop;
        token = install?.access_token;
      }
    }

    if (!shop || !token) {
      return new Response(JSON.stringify({ error: "No Shopify install/integration for this project" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blogId = await getOrCreateDefaultBlog(shop, token);

    const article: any = {
      title,
      body_html,
      published: true,
      tags: Array.isArray(tags) ? tags.join(",") : (tags || "AutoPilotGEO"),
    };
    if (handle) article.handle = handle;
    if (author) article.author = author;
    if (metaDescription) article.summary_html = `<p>${metaDescription}</p>`;

    const res = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/blogs/${blogId}/articles.json`,
      {
        method: "POST",
        headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ article }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error("[shopify-publish-article] failed:", res.status, errText);
      return new Response(JSON.stringify({ error: `Shopify API ${res.status}: ${errText.slice(0, 500)}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await res.json();
    const url = `https://${shop}/blogs/${j.article?.handle ? "news/" + j.article.handle : ""}`;

    return new Response(JSON.stringify({
      success: true, articleId: j.article?.id, url, shop, blogId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[shopify-publish-article]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
