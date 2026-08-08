// Quick diagnostic for shopping generation pipeline.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { projectId } = await req.json();
    if (!projectId) throw new Error("projectId required");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: products } = await supabase.from("shopping_products")
      .select("status, ai_title").eq("project_id", projectId);
    const total = products?.length || 0;
    const imported = products?.filter((p) => p.status === "imported").length || 0;
    const optimized = products?.filter((p) => p.status === "optimized").length || 0;
    const published = products?.filter((p) => p.status === "published").length || 0;
    const withAi = products?.filter((p) => !!p.ai_title).length || 0;

    const { data: planning } = await supabase.from("shopping_planning")
      .select("scheduled_date, published").eq("project_id", projectId);
    const plannedTotal = planning?.length || 0;
    const plannedFuture = planning?.filter((p) =>
      new Date(p.scheduled_date) >= new Date(new Date().toISOString().split("T")[0])
    ).length || 0;

    const { data: gs } = await supabase.from("generation_settings")
      .select("language, shopify_shop_info").eq("project_id", projectId).maybeSingle();
    const { data: intg } = await supabase.from("integrations")
      .select("platform, is_connected").eq("project_id", projectId);

    return new Response(JSON.stringify({
      products: { total, imported, optimized, published, withAi },
      planning: { total: plannedTotal, future: plannedFuture },
      settings: { language: gs?.language, hasShopifyContext: !!gs?.shopify_shop_info },
      integrations: intg,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
