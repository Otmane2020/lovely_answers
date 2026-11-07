import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditRequest {
  projectId: string;
  url: string;
}

interface AuditResult {
  category: string;
  status: "pass" | "warning" | "fail";
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  recommendation?: string;
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
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const lovableApiKey = Deno.env.get("OPENROUTER_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { projectId, url }: AuditRequest = await req.json();

    console.log(`[seo-audit] Starting audit for ${url}`);

    // Scrape the website using Firecrawl if available
    let pageContent = "";
    let pageMetadata: Record<string, unknown> = {};

    if (firecrawlApiKey) {
      try {
        const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            formats: ["markdown", "html"],
            onlyMainContent: false,
          }),
        });

        if (scrapeResponse.ok) {
          const scrapeData = await scrapeResponse.json();
          pageContent = scrapeData.data?.markdown || "";
          pageMetadata = scrapeData.data?.metadata || {};
          console.log(`[seo-audit] Scraped ${pageContent.length} chars from ${url}`);
        }
      } catch (scrapeError) {
        console.error(`[seo-audit] Firecrawl error:`, scrapeError);
      }
    }

    // Use AI to analyze SEO and AEO issues
    const auditPrompt = `You are an expert SEO and AEO (Answer Engine Optimization) auditor. Analyze this website for issues that would prevent it from ranking on Google AND being cited by AI assistants like ChatGPT, Gemini, and Perplexity.

URL: ${url}
Page Title: ${pageMetadata.title || "Not found"}
Meta Description: ${pageMetadata.description || "Not found"}
Page Content Length: ${pageContent.length} characters

Page Content Preview (first 3000 chars):
${pageContent.substring(0, 3000)}

Perform a comprehensive audit checking:

1. **Title Tag Issues** - Missing, too long (>60), too short (<30), missing keywords
2. **Meta Description** - Missing, too long (>160), not compelling
3. **H1 Tag** - Missing, multiple H1s, not optimized
4. **Heading Structure** - Poor hierarchy, missing H2/H3
5. **Content Quality** - Thin content, keyword stuffing, poor readability
6. **Internal Linking** - Missing internal links, broken structure
7. **Schema Markup** - Missing JSON-LD, incomplete structured data
8. **Mobile Optimization** - Viewport issues, responsive problems
9. **Page Speed Indicators** - Large images, render-blocking resources
10. **AEO Specific Issues**:
    - Content not structured for AI citation
    - Missing FAQ schema
    - No clear, citable answers
    - Content not scannable by LLMs
    - Missing llms.txt file indicators

Return a JSON array of audit results:
[
  {
    "category": "Title Tag|Meta Description|Headings|Content|Schema|AEO|Technical",
    "status": "pass|warning|fail",
    "title": "Issue title",
    "description": "What the issue is",
    "impact": "high|medium|low",
    "recommendation": "How to fix it"
  }
]

Include at least 10 checks. Be specific and actionable.`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          { role: "system", content: "You are an SEO expert. Always respond with valid JSON arrays only." },
          { role: "user", content: auditPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[seo-audit] AI API error: ${aiResponse.status}`, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const auditContent = aiData.choices?.[0]?.message?.content;

    let auditResults: AuditResult[] = [];
    try {
      const jsonMatch = auditContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                       auditContent.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, auditContent];
      const jsonStr = jsonMatch[1] || auditContent;
      auditResults = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error(`[seo-audit] Failed to parse audit results:`, parseError);
      auditResults = [
        {
          category: "Technical",
          status: "warning",
          title: "Audit partially completed",
          description: "Some audit checks could not be processed",
          impact: "medium",
          recommendation: "Run the audit again or contact support",
        },
      ];
    }

    // Calculate scores
    const totalChecks = auditResults.length;
    const passCount = auditResults.filter((r) => r.status === "pass").length;
    const warningCount = auditResults.filter((r) => r.status === "warning").length;
    const failCount = auditResults.filter((r) => r.status === "fail").length;

    const overallScore = Math.round((passCount * 100 + warningCount * 50) / totalChecks);

    const seoScore = Math.round(
      (auditResults
        .filter((r) => r.category !== "AEO")
        .reduce((acc, r) => acc + (r.status === "pass" ? 100 : r.status === "warning" ? 50 : 0), 0) /
        Math.max(auditResults.filter((r) => r.category !== "AEO").length, 1))
    );

    const aeoScore = Math.round(
      (auditResults
        .filter((r) => r.category === "AEO")
        .reduce((acc, r) => acc + (r.status === "pass" ? 100 : r.status === "warning" ? 50 : 0), 0) /
        Math.max(auditResults.filter((r) => r.category === "AEO").length, 1))
    );

    console.log(`[seo-audit] Audit complete. Score: ${overallScore}, SEO: ${seoScore}, AEO: ${aeoScore}`);

    return new Response(
      JSON.stringify({
        success: true,
        url,
        scores: {
          overall: overallScore,
          seo: seoScore,
          aeo: aeoScore,
        },
        summary: {
          total: totalChecks,
          passed: passCount,
          warnings: warningCount,
          failed: failCount,
        },
        results: auditResults,
        scrapedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[seo-audit] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
