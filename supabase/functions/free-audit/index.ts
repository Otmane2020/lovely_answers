import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY")!;

    const { url } = await req.json();
    if (!url || typeof url !== "string" || url.length > 2048) {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean URL - normalize accented characters
    let cleanUrl = url.trim();
    cleanUrl = cleanUrl.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!cleanUrl.startsWith("http")) {
      cleanUrl = `https://${cleanUrl}`;
    }

    let domain: string;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanUrl);
      domain = parsedUrl.hostname.replace("www.", "");
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SSRF guard
    if (!/^https?:$/.test(parsedUrl.protocol)) {
      return new Response(JSON.stringify({ error: "Only http(s) URLs are allowed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const host = parsedUrl.hostname.toLowerCase();
    const blockedHostPatterns = [
      /^localhost$/i, /\.localhost$/i, /^127\./, /^10\./, /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[0-1])\./, /^169\.254\./, /^0\./, /^::1$/, /^fc/, /^fd/,
      /^metadata\.google\.internal$/i,
    ];
    if (blockedHostPatterns.some((re) => re.test(host))) {
      return new Response(JSON.stringify({ error: "Private/internal hosts are not allowed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[free-audit] Starting audit for ${cleanUrl} (domain: ${domain})`);

    // Step 1: Scrape website content
    let pageContent = "";
    let pageTitle = "";
    let metaDescription = "";
    let htmlContent = "";

    if (firecrawlApiKey) {
      try {
        console.log("[free-audit] Scraping with Firecrawl...");
        const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: cleanUrl,
            formats: ["markdown", "html"],
            onlyMainContent: false,
          }),
        });

        if (scrapeResponse.ok) {
          const scrapeData = await scrapeResponse.json();
          pageContent = scrapeData.data?.markdown || "";
          htmlContent = scrapeData.data?.html || "";
          pageTitle = scrapeData.data?.metadata?.title || "";
          metaDescription = scrapeData.data?.metadata?.description || "";
          console.log(`[free-audit] Scraped ${pageContent.length} chars`);
        } else {
          console.error("[free-audit] Firecrawl error:", scrapeResponse.status);
        }
      } catch (scrapeError) {
        console.error("[free-audit] Firecrawl error:", scrapeError);
      }
    }

    // Fallback: internal scraper if Firecrawl failed
    if (!pageContent) {
      try {
        console.log("[free-audit] Fallback: internal-scraper...");
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          const scraperRes = await fetch(`${SUPABASE_URL}/functions/v1/internal-scraper`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: cleanUrl, timeout: 15000 }),
          });
          if (scraperRes.ok) {
            const scraperData = await scraperRes.json();
          if (scraperData.success) {
              pageContent = scraperData.data?.markdown || "";
              htmlContent = scraperData.data?.html || "";
              pageTitle = scraperData.data?.title || scraperData.data?.metadata?.title || "";
              metaDescription = scraperData.data?.metaDescription || scraperData.data?.metadata?.description || "";
              console.log(`[free-audit] Internal scraper: ${pageContent.length} chars, title="${pageTitle?.substring(0, 50)}"`);
            }
          }
        }
      } catch (e) {
        console.error("[free-audit] Internal scraper error:", e);
      }
    }

    // Fallback 2: direct fetch
    if (!pageContent) {
      try {
        console.log("[free-audit] Fallback: direct fetch...");
        const response = await fetch(cleanUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html",
          },
        });
        if (response.ok) {
          htmlContent = await response.text();
          const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
          pageTitle = titleMatch?.[1]?.trim() || "";
          const descMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
          metaDescription = descMatch?.[1]?.trim() || "";
          const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          if (bodyMatch) {
            pageContent = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .substring(0, 5000);
          }
          console.log(`[free-audit] Direct fetch: ${pageContent.length} chars`);
        }
      } catch (e) {
        console.error("[free-audit] Direct fetch error:", e);
      }
    }

    // Step 2: AI-powered audit analysis
    const auditPrompt = `You are an expert SEO and AEO (Answer Engine Optimization) auditor. Analyze this website comprehensively.

URL: ${cleanUrl}
Domain: ${domain}
Page Title: ${pageTitle || "Not found"}
Meta Description: ${metaDescription || "Not found"}
Content Length: ${pageContent.length} characters

Page Content (first 4000 chars):
${pageContent.substring(0, 4000)}

Perform a COMPREHENSIVE audit with exactly 15 checks across these categories:

**SEO Checks (8-9 checks):**
1. Title Tag - Is it present, optimal length (30-60 chars), contains keywords?
2. Meta Description - Present, compelling, optimal length (120-160 chars)?
3. H1 Tag - Single H1 present, keyword-optimized?
4. Heading Hierarchy - Proper H1>H2>H3 structure?
5. Content Depth - Enough content (min 300+ words)? Quality assessment
6. Internal Links - Are there internal links for navigation?
7. Schema Markup / Structured Data - JSON-LD present?
8. Mobile & Speed - Viewport meta, responsive indicators?
9. Image Optimization - Alt tags, lazy loading?

**AEO Checks (6-7 checks):**
10. AI-Citable Content - Content structured with clear Q&A or definitions AI can quote?
11. FAQ Schema - FAQ structured data present?
12. Entity Authority - Clear brand/entity information, About page, contact info?
13. Content Freshness - Recent publication dates, blog/news section?
14. llms.txt / AI Crawlability - Indicators that AI bots can access content?
15. Topical Authority - Deep coverage of core topics, supporting articles?

For each check, assess honestly based on the actual content. Don't be overly generous.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "category": "Title Tag",
    "status": "pass",
    "title": "Title tag is well optimized",
    "description": "The title is 52 characters and includes main keyword",
    "impact": "high",
    "recommendation": "Consider adding brand name at the end"
  }
]

Rules:
- status must be "pass", "warning", or "fail"
- impact must be "high", "medium", or "low"
- Be specific with actual findings from the content
- Include actionable recommendations for warnings and fails
- Return exactly 15 checks`;

    console.log("[free-audit] Calling AI for audit analysis...");
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://autopilotgeo.com",
        "X-Title": "AutoPilot Geo Audit",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          { role: "system", content: "You are an SEO & AEO expert auditor. Always respond with valid JSON arrays only. Never wrap in markdown code blocks." },
          { role: "user", content: auditPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[free-audit] AI error: ${aiResponse.status}`, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const auditContent = aiData.choices?.[0]?.message?.content;
    console.log("[free-audit] AI response length:", auditContent?.length);

    let auditResults: AuditResult[] = [];
    try {
      // Try to extract JSON from response
      let jsonStr = auditContent;
      // Remove markdown code blocks
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) jsonStr = codeBlockMatch[1];
      jsonStr = jsonStr.trim();
      // Find the JSON array
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) jsonStr = arrayMatch[0];
      // Fix common JSON issues: trailing commas, smart quotes
      jsonStr = jsonStr
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
      auditResults = JSON.parse(jsonStr);
      console.log(`[free-audit] Parsed ${auditResults.length} audit results`);
    } catch (parseError) {
      console.error("[free-audit] Parse error:", parseError);
      // Try line-by-line recovery
      try {
        const arrayMatch = auditContent.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          // Remove problematic trailing content and force-close
          let fixed = arrayMatch[0].replace(/,\s*([}\]])/g, '$1');
          // Try truncating at last complete object
          const lastBrace = fixed.lastIndexOf('}');
          if (lastBrace > 0) {
            fixed = fixed.substring(0, lastBrace + 1) + ']';
          }
          auditResults = JSON.parse(fixed);
          console.log(`[free-audit] Recovered ${auditResults.length} audit results`);
        }
      } catch {
        auditResults = [
          { category: "Technical", status: "warning", title: "Audit partially completed", description: "Some checks could not be processed. Please try again.", impact: "medium", recommendation: "Run the audit again" },
        ];
      }
    }

    // Calculate scores
    const totalChecks = auditResults.length;
    const passCount = auditResults.filter((r) => r.status === "pass").length;
    const warningCount = auditResults.filter((r) => r.status === "warning").length;
    const failCount = auditResults.filter((r) => r.status === "fail").length;

    const overallScore = Math.round((passCount * 100 + warningCount * 50) / Math.max(totalChecks, 1));

    const aeoCategories = ["AI-Citable Content", "FAQ Schema", "Entity Authority", "Content Freshness", "llms.txt", "AI Crawlability", "Topical Authority", "AEO"];
    const seoResults = auditResults.filter((r) => !aeoCategories.some(c => r.category.toLowerCase().includes(c.toLowerCase())));
    const aeoResults = auditResults.filter((r) => aeoCategories.some(c => r.category.toLowerCase().includes(c.toLowerCase())));

    const seoScore = seoResults.length > 0
      ? Math.round(seoResults.reduce((acc, r) => acc + (r.status === "pass" ? 100 : r.status === "warning" ? 50 : 0), 0) / seoResults.length)
      : 50;

    const aeoScore = aeoResults.length > 0
      ? Math.round(aeoResults.reduce((acc, r) => acc + (r.status === "pass" ? 100 : r.status === "warning" ? 50 : 0), 0) / aeoResults.length)
      : 30;

    console.log(`[free-audit] ✅ Complete. Overall: ${overallScore}, SEO: ${seoScore}, AEO: ${aeoScore}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: cleanUrl,
        domain,
        pageTitle,
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
    console.error("[free-audit] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
