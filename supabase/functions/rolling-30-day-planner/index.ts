import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * rolling-30-day-planner
 * ----------------------
 * ONE content piece per calendar day, on a rolling 30-day window, with the
 * type rotating every day:
 *
 *   day 0 -> GEO
 *   day 1 -> SEO
 *   day 2 -> AEO
 *   day 3 -> LOCAL AEO
 *   day 4 -> SHOPPING AEO
 *   day 5 -> GEO ... (repeat)
 *
 * It never generates content itself: each type is delegated to the dedicated
 * function that already owns that editorial format
 * (generate-geo-content / generate-articles / generate-aeo-answers +
 * generate-aeo-article / generate-local-answer / generate-product-ai).
 * This function only decides WHICH day needs WHAT, calls the right
 * specialist with the service role key, and stamps scheduled_date.
 *
 * Because the window is recomputed from the database on every run, running
 * it daily keeps the calendar permanently 30 days deep ("glissant").
 *
 * CRON (already installed, hourly at :10 — see below):
 *
 *   select cron.schedule(
 *     'rolling-30-day-planner-hourly',
 *     '10 * * * *',
 *     $$ select net.http_post(
 *          url := 'https://<project>.supabase.co/functions/v1/rolling-30-day-planner',
 *          headers := '{"Content-Type":"application/json","Authorization":"Bearer <service_role>"}'::jsonb,
 *          body := '{"maxSlots":4}'::jsonb
 *        ); $$
 *   );
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ROTATION = ["geo", "seo", "aeo", "local_aeo", "shopping"] as const;
type Slot = typeof ROTATION[number];

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

async function callFn(
  supabase: any,
  serviceRoleKey: string,
  name: string,
  payload: unknown,
) {
  const { data, error } = await supabase.functions.invoke(name, {
    body: payload,
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (error) throw new Error(`${name} failed: ${error.message}`);
  if (data?.error) throw new Error(`${name} failed: ${data.error}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Two callers: pg_cron / other functions with the service role key, or a
    // signed-in user from the dashboard.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // pg_cron posts with the project anon key (same convention as the other
    // scheduled functions here), which auth.getUser() cannot resolve.
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const isInternal = token === serviceRoleKey || (!!anonKey && token === anonKey);
    if (!isInternal) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const { projectId } = body;
    // Cap AI work per invocation so a single run can never time out; the next
    // run resumes from whatever the database still shows as missing.
    const maxSlots = Math.min(Math.max(Number(body.maxSlots) || 4, 1), 30);

    const projectsQuery = supabase
      .from("projects")
      .select("id, name, brand_name, website_url, language, business_type")
      .eq("is_active", true);
    const { data: projects, error: projectsError } = projectId
      ? await projectsQuery.eq("id", projectId)
      : await projectsQuery;
    if (projectsError) throw projectsError;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today.getTime() + 30 * 86400000);

    const results: any[] = [];

    for (const project of projects || []) {
      const { data: settings } = await supabase
        .from("generation_settings")
        .select("language, brand_name, website_url, business_description")
        .eq("project_id", project.id)
        .maybeSingle();

      const brand = settings?.brand_name || project.brand_name || project.name;
      const website = settings?.website_url || project.website_url || "";
      const language = settings?.language || project.language || "en";

      // Local AEO needs a verified location, Shopping AEO needs a catalog.
      const [{ data: localBusiness }, { count: productCount }] = await Promise.all([
        supabase.from("local_businesses").select("id").eq("project_id", project.id).maybeSingle(),
        supabase.from("shopping_products").select("id", { count: "exact", head: true })
          .eq("project_id", project.id),
      ]);
      const hasProducts = (productCount || 0) > 0;

      // Which days of the rolling window already hold a piece — of any type.
      const [geoRes, artRes, ansRes, locRes, shopRes] = await Promise.all([
        supabase.from("geo_contents").select("scheduled_date").eq("project_id", project.id)
          .gte("scheduled_date", today.toISOString()).lt("scheduled_date", in30.toISOString()),
        supabase.from("articles").select("scheduled_date").eq("project_id", project.id)
          .gte("scheduled_date", today.toISOString()).lt("scheduled_date", in30.toISOString()),
        supabase.from("answers").select("scheduled_date").eq("project_id", project.id)
          .gte("scheduled_date", today.toISOString()).lt("scheduled_date", in30.toISOString()),
        supabase.from("local_answers").select("scheduled_date").eq("project_id", project.id)
          .gte("scheduled_date", dayKey(today)).lt("scheduled_date", dayKey(in30)),
        supabase.from("shopping_planning").select("scheduled_date").eq("project_id", project.id)
          .gte("scheduled_date", dayKey(today)).lt("scheduled_date", dayKey(in30)),
      ]);

      const covered = new Set<string>();
      for (const set of [geoRes.data, artRes.data, ansRes.data, locRes.data, shopRes.data]) {
        for (const row of set || []) {
          if (row?.scheduled_date) covered.add(dayKey(new Date(row.scheduled_date)));
        }
      }

      // Unused keywords feed the GEO/SEO slots; the rotation must not stall
      // when the list is empty, so a brand-level fallback topic is used.
      const { data: kwRows } = await supabase
        .from("keywords")
        .select("id, keyword")
        .eq("project_id", project.id)
        .eq("is_used", false)
        .limit(30);
      const keywords: { id: string; keyword: string }[] = kwRows || [];
      let kwIndex = 0;
      const nextKeyword = () =>
        keywords[kwIndex++] ??
        { id: "", keyword: `${brand} ${project.business_type || "guide"}` };

      let filled = 0;
      let attempted = 0;
      const errors: string[] = [];

      for (let offset = 0; offset < 30 && attempted < maxSlots; offset++) {
        const date = new Date(today.getTime() + offset * 86400000);
        if (covered.has(dayKey(date))) continue;

        let type: Slot = ROTATION[offset % ROTATION.length];
        // Degrade gracefully instead of leaving the day empty.
        if (type === "local_aeo" && !localBusiness) type = "aeo";
        if (type === "shopping" && !hasProducts) type = "geo";

        attempted++;
        const iso = date.toISOString();

        try {
          if (type === "geo") {
            const kw = nextKeyword();
            const data = await callFn(supabase, serviceRoleKey, "generate-geo-content", {
              projectId: project.id,
              topic: kw.keyword,
              brand,
              website,
              language,
              contentType: "geo",
              keywords: [kw.keyword],
            });
            const id = data?.content?.id || data?.id;
            if (id) {
              await supabase.from("geo_contents").update({ scheduled_date: iso }).eq("id", id);
            }
            if (kw.id) await supabase.from("keywords").update({ is_used: true }).eq("id", kw.id);
          } else if (type === "seo") {
            const kw = nextKeyword();
            const data = await callFn(supabase, serviceRoleKey, "generate-articles", {
              projectId: project.id,
              keywords: [kw.keyword],
              language,
              count: 1,
            });
            const id = data?.articles?.[0]?.id;
            if (id) {
              await supabase.from("articles")
                .update({ scheduled_date: iso, status: "scheduled" })
                .eq("id", id);
            }
            if (kw.id) await supabase.from("keywords").update({ is_used: true }).eq("id", kw.id);
          } else if (type === "aeo") {
            const data = await callFn(supabase, serviceRoleKey, "generate-aeo-answers", {
              projectId: project.id,
              useKeywords: true,
              targetPlatforms: ["chatgpt", "gemini", "claude"],
              language,
            });
            const answer = data?.answers?.[0];
            if (!answer) throw new Error("no answer produced");
            await supabase.from("answers").update({ scheduled_date: iso }).eq("id", answer.id);
            try {
              const art = await callFn(supabase, serviceRoleKey, "generate-aeo-article", {
                answerId: answer.id,
                language,
              });
              if (art?.article?.id) {
                await supabase.from("articles")
                  .update({ scheduled_date: iso, status: "scheduled" })
                  .eq("id", art.article.id);
              }
            } catch (e) {
              console.warn(`[rolling-30-day-planner] AEO article step failed: ${e}`);
            }
          } else if (type === "local_aeo") {
            const data = await callFn(supabase, serviceRoleKey, "generate-local-answer", {
              projectId: project.id,
            });
            const id = data?.answer?.id || data?.localAnswer?.id || data?.id;
            if (id) {
              await supabase.from("local_answers")
                .update({ scheduled_date: dayKey(date) })
                .eq("id", id);
            }
          } else if (type === "shopping") {
            const { data: product } = await supabase
              .from("shopping_products")
              .select("id")
              .eq("project_id", project.id)
              .eq("status", "imported")
              .limit(1)
              .maybeSingle();
            if (!product) throw new Error("no product left to enrich");
            await callFn(supabase, serviceRoleKey, "generate-product-ai", {
              productId: product.id,
              projectId: project.id,
              language,
            });
            await supabase.from("shopping_planning").insert({
              project_id: project.id,
              product_id: product.id,
              scheduled_date: dayKey(date),
              status: "scheduled",
            });
          }

          covered.add(dayKey(date));
          filled++;
          console.log(`[rolling-30-day-planner] ${project.name} ${dayKey(date)} -> ${type} OK`);
        } catch (e: any) {
          console.error(`[rolling-30-day-planner] ${project.name} ${dayKey(date)} (${type}):`, e?.message || e);
          errors.push(`${dayKey(date)} ${type}: ${e?.message || e}`);
        }

        await new Promise((r) => setTimeout(r, 400));
      }

      results.push({
        projectId: project.id,
        name: project.name,
        filled,
        attempted,
        daysCovered: covered.size,
        daysMissing: 30 - covered.size,
        errors,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[rolling-30-day-planner] Fatal:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
