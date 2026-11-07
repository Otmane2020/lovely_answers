import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface KeywordRequest {
  projectId: string;
  seedKeywords?: string[];
  competitorUrls?: string[];
  language?: string;
  country?: string;
}

interface KeywordCluster {
  name: string;
  intent: "informational" | "transactional" | "navigational" | "commercial";
  keywords: {
    keyword: string;
    volume: number;
    difficulty: number;
    cpc: number;
    trend: "up" | "stable" | "down";
    aeoScore: number;
  }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("OPENROUTER_API_KEY")!;
    const dataForSeoLogin = Deno.env.get("DATAFORSEO_LOGIN");
    const dataForSeoPassword = Deno.env.get("DATAFORSEO_PASSWORD");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      projectId, 
      seedKeywords = [], 
      competitorUrls = [],
      language = "en",
      country = "us"
    }: KeywordRequest = await req.json();

    console.log(`[keyword-research] Starting research for project ${projectId}`);

    // Get project details
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found");
    }

    let serpData: unknown[] = [];

    // Try to get real SERP data from DataForSEO if credentials available
    if (dataForSeoLogin && dataForSeoPassword) {
      try {
        const authString = btoa(`${dataForSeoLogin}:${dataForSeoPassword}`);
        
        for (const keyword of seedKeywords.slice(0, 3)) {
          const serpResponse = await fetch(
            "https://api.dataforseo.com/v3/serp/google/organic/live/regular",
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${authString}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify([
                {
                  keyword,
                  language_code: language,
                  location_code: country === "us" ? 2840 : 2826,
                  depth: 20,
                },
              ]),
            }
          );

          if (serpResponse.ok) {
            const data = await serpResponse.json();
            serpData.push(...(data.tasks?.[0]?.result?.[0]?.items || []));
          }
        }
        console.log(`[keyword-research] Got ${serpData.length} SERP results from DataForSEO`);
      } catch (dataError) {
        console.error(`[keyword-research] DataForSEO error:`, dataError);
      }
    }

    // Use AI to generate comprehensive keyword research with SERP clustering
    const keywordPrompt = `You are an expert SEO and keyword research specialist. Generate comprehensive keyword research for:

Business: ${project.brand_name || project.name}
Website: ${project.website_url}
Industry: ${project.business_type || "General"}
Target Audience: ${project.audience || "General audience"}
Seed Keywords: ${seedKeywords.join(", ") || "Not provided"}
Competitors: ${competitorUrls.join(", ") || project.competitors?.join(", ") || "Not provided"}
Language: ${language}
Country: ${country}

${serpData.length > 0 ? `
Real SERP Data (titles from top results):
${serpData.slice(0, 10).map((item: any) => `- ${item.title}`).join("\n")}
` : ""}

Generate keyword clusters based on SERP intent analysis. For each cluster:
1. Group semantically related keywords
2. Identify search intent (informational, transactional, navigational, commercial)
3. Estimate search volume (realistic monthly estimates)
4. Calculate keyword difficulty (0-100)
5. Estimate CPC in USD
6. Determine trend direction
7. Calculate AEO Score (how likely AI assistants will cite content for this keyword, 0-100)

Return JSON with this structure:
{
  "clusters": [
    {
      "name": "Cluster name",
      "intent": "informational|transactional|navigational|commercial",
      "keywords": [
        {
          "keyword": "keyword phrase",
          "volume": 1000,
          "difficulty": 45,
          "cpc": 2.50,
          "trend": "up|stable|down",
          "aeoScore": 75
        }
      ]
    }
  ],
  "summary": {
    "totalKeywords": 50,
    "avgVolume": 2500,
    "avgDifficulty": 40,
    "topOpportunities": ["keyword1", "keyword2", "keyword3"]
  }
}

Generate at least 5 clusters with 5-10 keywords each. Focus on:
- Long-tail keywords with high AEO potential
- Question-based keywords (what, how, why, best, etc.)
- Commercial keywords with purchase intent
- Competitor gap keywords`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          { role: "system", content: "You are a keyword research expert. Always respond with valid JSON only." },
          { role: "user", content: keywordPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[keyword-research] AI API error: ${aiResponse.status}`, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const keywordContent = aiData.choices?.[0]?.message?.content;

    let keywordData;
    try {
      const jsonMatch = keywordContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                       keywordContent.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, keywordContent];
      const jsonStr = jsonMatch[1] || keywordContent;
      keywordData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error(`[keyword-research] Failed to parse keyword data:`, parseError);
      throw new Error("Failed to parse keyword research results");
    }

    // Extract top keywords for article generation
    const allKeywords = keywordData.clusters
      ?.flatMap((c: KeywordCluster) => c.keywords)
      ?.sort((a: any, b: any) => b.aeoScore - a.aeoScore)
      ?.slice(0, 30)
      ?.map((k: any) => k.keyword) || [];

    console.log(`[keyword-research] Research complete. ${keywordData.clusters?.length || 0} clusters, ${allKeywords.length} keywords`);

    return new Response(
      JSON.stringify({
        success: true,
        projectId,
        clusters: keywordData.clusters || [],
        summary: keywordData.summary || {},
        topKeywords: allKeywords,
        language,
        country,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[keyword-research] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
