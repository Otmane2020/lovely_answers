import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildPublicBlogUrl(baseUrl: string | null | undefined, slug: string | null | undefined) {
  if (!baseUrl || !slug) return null;
  return `${baseUrl.replace(/\/+$/, "")}/blog/${slug}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Optional single-id mode (from manual "Publish" button)
    let geoContentId: string | undefined;
    let forcedProjectId: string | undefined;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        geoContentId = body?.geoContentId;
        forcedProjectId = body?.projectId;
      } catch { /* no body, batch mode */ }
    }

    const today = new Date().toISOString();

    let query = supabase
      .from("geo_contents")
      .select("*, projects!geo_contents_project_id_fkey(id, brand_name, website_url, user_id)");

    if (geoContentId) {
      query = query.eq("id", geoContentId).limit(1);
    } else {
      query = query.lte("scheduled_date", today).is("published_at", null).limit(10);
    }

    const { data: contents, error } = await query;

    if (error) {
      console.error("Fetch error:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${contents?.length || 0} GEO contents to publish (single=${!!geoContentId})`);

    let published = 0;
    let firstPublishedUrl: string | null = null;
    let lastError: string | null = null;

    for (const content of contents || []) {
      const project = content.projects;
      if (!project) continue;

      // Check if project has a connected CMS integration
      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("project_id", content.project_id)
        .eq("is_connected", true)
        .maybeSingle();

      if (integration) {
        // Push to CMS via cms-publish function — MUST pass integrationId + content.body
        try {
          const body = content.html_content || content.content || "";
          if (!body.trim()) {
            lastError = "GEO content has no body to publish";
            console.error(`[publish-geo-content] ${lastError} for ${content.id}`);
            continue;
          }
          const cmsRes = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/cms-publish`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                integrationId: integration.id,
                projectId: content.project_id,
                content: {
                  title: content.title,
                  body,
                  excerpt: content.meta_description,
                  slug: content.slug,
                  type: "article",
                  sourceId: content.id,
                },
              }),
            }
          );

          const cmsData = await cmsRes.json().catch(() => ({}));
          console.log(`[publish-geo-content] cms-publish response for ${content.id}:`, JSON.stringify(cmsData).slice(0, 300));

          if (cmsRes.ok && cmsData?.success) {
            const publishedUrl = cmsData.publishedUrl || cmsData.url || buildPublicBlogUrl(project.website_url, content.slug);
            const { error: updateError } = await supabase
              .from("geo_contents")
              .update({
                published_at: new Date().toISOString(),
                is_public: true,
                published_url: publishedUrl,
              })
              .eq("id", content.id);
            if (updateError) throw updateError;

            published++;
            if (!firstPublishedUrl) firstPublishedUrl = publishedUrl;
            console.log(`Published GEO content ${content.id} to CMS: ${publishedUrl || content.id}`);
            continue;
          } else {
            lastError = cmsData?.error || cmsData?.message || "CMS publish returned no URL";
            console.error(`[publish-geo-content] CMS publish failed for ${content.id}:`, lastError);
            continue;
          }
        } catch (cmsErr: any) {
          lastError = cmsErr?.message || String(cmsErr);
          console.error(`CMS publish failed for ${content.id}:`, cmsErr);
          continue;
        }
      }

      // Fallback only when no CMS is connected: mark as published internally.
      const fallbackUrl = buildPublicBlogUrl(project.website_url, content.slug);
      const { error: fallbackUpdateError } = await supabase
        .from("geo_contents")
        .update({
          published_at: new Date().toISOString(),
          is_public: true,
          published_url: fallbackUrl,
        })
        .eq("id", content.id);
      if (fallbackUpdateError) throw fallbackUpdateError;

      published++;
      if (!firstPublishedUrl) firstPublishedUrl = fallbackUrl;
      console.log(`Published GEO content ${content.id} internally: ${fallbackUrl || content.id}`);
    }

    console.log(`Published ${published} GEO contents`);

    return new Response(
      JSON.stringify({
        success: published > 0,
        published,
        total: contents?.length || 0,
        publishedUrl: firstPublishedUrl,
        error: published === 0 ? lastError : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Publish GEO error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
