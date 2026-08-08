import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, websiteUrl, existingAudiences } = await req.json();

    if (!projectId || !websiteUrl) {
      throw new Error("Project ID and website URL are required");
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get project context
    const { data: project } = await supabase
      .from("projects")
      .select("name, business_description, website_url")
      .eq("id", projectId)
      .single();

    const { data: genSettings } = await supabase
      .from("generation_settings")
      .select("business_description")
      .eq("project_id", projectId)
      .single();

    const businessContext = genSettings?.business_description || project?.business_description || "";

    const prompt = `Analyze this business and suggest 4-6 specific target audience segments.

Business: ${project?.name || "Unknown"}
Website: ${websiteUrl}
Description: ${businessContext}

${existingAudiences?.length > 0 ? `Already defined audiences (do NOT repeat these): ${existingAudiences.join(", ")}` : ""}

Return ONLY a JSON array of audience strings. Each audience should be:
- Specific and actionable (e.g., "E-commerce store owners scaling to $1M+" not just "Business owners")
- Relevant to the business niche
- 2-6 words each

Example format: ["SaaS founders raising Series A", "Marketing managers at mid-size agencies", "Technical recruiters in tech hubs"]

Return ONLY the JSON array, no explanation.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          { role: "system", content: "You are a marketing expert. Return only valid JSON arrays." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[suggest-audiences] AI error:", errorText);
      throw new Error("AI service error");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";

    // Parse JSON from response
    let suggestions: string[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[suggest-audiences] JSON parse error:", e);
      suggestions = [];
    }

    // Filter out existing audiences
    const newSuggestions = suggestions.filter(
      (s: string) => !existingAudiences?.includes(s)
    );

    console.log(`[suggest-audiences] Returning ${newSuggestions.length} suggestions`);

    return new Response(
      JSON.stringify({ suggestions: newSuggestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[suggest-audiences] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
