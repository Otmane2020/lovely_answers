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

    // SECURITY: require either a valid user JWT (manual trigger from the dashboard)
    // or the service-role key (scheduled cron). Reject everything else so attackers
    // cannot drain AI credits by triggering mass generation across all projects.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isServiceRole = token === serviceRoleKey;
    if (!isServiceRole) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get projectId from body (manual trigger) or process all projects (cron)
    let projectIds: string[] = [];

    try {
      const body = await req.json();
      if (body?.projectId) {
        projectIds = [body.projectId];
      }
    } catch {
      // No body = cron trigger, process all projects with imported products
    }

    if (projectIds.length === 0) {
      // Find all projects that have imported (non-optimized) shopping products
      const { data: projects } = await supabase
        .from("shopping_products")
        .select("project_id")
        .eq("status", "imported");

      if (projects && projects.length > 0) {
        projectIds = [...new Set(projects.map((p: any) => p.project_id))];
      }
    }

    if (projectIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No projects to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const projectId of projectIds) {
      try {
        // Step 1: Generate AI content for non-optimized products
        const { data: genResult, error: genError } = await supabase.functions.invoke("generate-product-ai", {
          body: { projectId, all: true },
        });

        if (genError) {
          console.error(`AI gen error for project ${projectId}:`, genError);
        }

        const generatedCount = genResult?.processed || 0;

        // Only fill planning if we have at least some optimized products (existing or freshly generated)
        const { count: optimizedCount } = await supabase
          .from("shopping_products")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .not("ai_title", "is", null);

        let plannedCount = 0;
        if ((optimizedCount || 0) > 0) {
          const { data: planResult, error: planError } = await supabase.functions.invoke("fill-shopping-planning", {
            body: { projectId },
          });
          if (planError) console.error(`Planning fill error for project ${projectId}:`, planError);
          plannedCount = planResult?.daysAdded || 0;
        } else {
          console.warn(`Skipping planning for project ${projectId}: no optimized products`);
        }

        results.push({
          projectId,
          generated: generatedCount,
          optimizedTotal: optimizedCount || 0,
          planned: plannedCount,
        });
      } catch (e) {
        console.error(`Error processing project ${projectId}:`, e);
        results.push({ projectId, error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("auto-generate-shopping error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
