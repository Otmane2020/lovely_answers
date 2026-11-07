import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface KeywordSuggestion {
  keyword: string;
  intent: "informational" | "transactional" | "navigational" | "commercial";
}

async function fetchWebsiteContentViaFirecrawl(url: string, firecrawlApiKey: string): Promise<string> {
  try {
    console.log("[suggest-keywords] Scraping website via Firecrawl:", url);
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 15000,
      }),
    });

    if (!response.ok) {
      console.error("[suggest-keywords] Firecrawl error:", response.status);
      return "";
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || "";
    const title = data.data?.metadata?.title || "";
    const description = data.data?.metadata?.description || "";

    let content = "";
    if (title) content += `Title: ${title}\n`;
    if (description) content += `Description: ${description}\n`;
    if (markdown) content += `\n${markdown}`;

    console.log("[suggest-keywords] Firecrawl scraped", content.length, "chars");
    return content.substring(0, 8000);
  } catch (e) {
    console.error("[suggest-keywords] Firecrawl fetch error:", e);
    return "";
  }
}

async function fetchWebsiteContentFallback(url: string): Promise<string> {
  try {
    console.log("[suggest-keywords] Fallback: basic HTML fetch:", url);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return "";

    const html = await res.text();
    let content = "";

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) content += `Title: ${titleMatch[1].trim()}\n`;

    const descMatch =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (descMatch) content += `Description: ${descMatch[1].trim()}\n`;

    const headingRegexes = [/<h1[^>]*>([\s\S]*?)<\/h1>/gi, /<h2[^>]*>([\s\S]*?)<\/h2>/gi];
    for (const regex of headingRegexes) {
      const matches = html.matchAll(regex);
      for (const match of matches) {
        const text = match[1].replace(/<[^>]+>/g, "").trim();
        if (text && text.length > 2) content += `${text}\n`;
      }
    }

    const pMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    let pCount = 0;
    for (const match of pMatches) {
      const text = match[1].replace(/<[^>]+>/g, "").trim();
      if (text && text.length > 20) {
        content += `${text}\n`;
        pCount++;
        if (pCount >= 10) break;
      }
    }

    console.log("[suggest-keywords] Fallback scraped", content.length, "chars");
    return content.substring(0, 6000);
  } catch (e) {
    console.error("[suggest-keywords] Fallback fetch error:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, existingKeywords } = await req.json();

    if (!projectId) {
      throw new Error("Project ID is required");
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY") || Deno.env.get("FIRECRAWL_API_KEY_CUSTOM");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get project context
    const { data: project } = await supabase
      .from("projects")
      .select("name, business_description, website_url, audience, language")
      .eq("id", projectId)
      .single();

    const { data: genSettings } = await supabase
      .from("generation_settings")
      .select("business_description, target_audiences, language")
      .eq("project_id", projectId)
      .single();

    // Get already crawled site_pages for richer context
    const { data: sitePages } = await supabase
      .from("site_pages")
      .select("url, title, meta_description")
      .eq("project_id", projectId)
      .order("last_crawled_at", { ascending: false })
      .limit(20);

    const businessContext = genSettings?.business_description || project?.business_description || "";
    const audiences = genSettings?.target_audiences || [];
    const language = genSettings?.language || project?.language || "en";
    const websiteUrl = project?.website_url || "";

    // Build site pages context from DB (already crawled data)
    let sitePagesContext = "";
    if (sitePages && sitePages.length > 0) {
      sitePagesContext = sitePages
        .map((p) => `- ${p.title || p.url}${p.meta_description ? `: ${p.meta_description}` : ""}`)
        .join("\n");
      console.log(`[suggest-keywords] Using ${sitePages.length} cached site pages for context`);
    }

    // Fetch live website content via Firecrawl (or fallback)
    let websiteContent = "";
    if (websiteUrl) {
      if (firecrawlApiKey) {
        websiteContent = await fetchWebsiteContentViaFirecrawl(websiteUrl, firecrawlApiKey);
      }
      if (!websiteContent) {
        websiteContent = await fetchWebsiteContentFallback(websiteUrl);
      }
    }

    const prompt = `You are an expert SEO keyword researcher. Suggest 10-15 long-tail keywords for this website.

Site: ${project?.name || "Unknown"}
URL: ${websiteUrl}
Description: ${businessContext}
Target audiences: ${audiences.join(", ") || "General"}
Content language: ${language}

${websiteContent ? `ACTUAL WEBSITE CONTENT (scraped via Firecrawl):
${websiteContent}` : ""}

${sitePagesContext ? `CRAWLED SITE PAGES:
${sitePagesContext}` : ""}

${existingKeywords?.length > 0 ? `EXISTING KEYWORDS (DO NOT repeat these): ${existingKeywords.slice(0, 50).join(", ")}` : ""}

INSTRUCTIONS:
- Generate keywords based on the ACTUAL website content above
- Focus on products, services, and categories actually present on the site
- Keywords in ${language === "fr" ? "French" : language === "en" ? "English" : language}
- Focus on long-tail keywords (3-6 words) with clear search intent
- Include questions users would actually ask about this business
- Include keywords that AI assistants (ChatGPT, Perplexity, Claude) would use to cite this content

For each keyword, determine intent:
- informational: User wants to learn (how, what is, guide)
- transactional: User wants to buy/sign up (buy, price, cheap)
- commercial: User compares options (best, vs, review, comparison)
- navigational: User looks for a specific page/brand

Return ONLY a JSON array:
[
  {"keyword": "relevant keyword here", "intent": "informational"},
  {"keyword": "another keyword", "intent": "transactional"}
]`;

    const FREE_MODELS = [
      "google/gemini-2.0-flash-exp:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "deepseek/deepseek-chat-v3.1:free",
      "meta-llama/llama-3.2-3b-instruct:free",
      "google/gemma-2-9b-it:free",
      "mistralai/mistral-7b-instruct:free",
      "qwen/qwen-2-7b-instruct:free",
    ];

    let content = "";
    let lastError = "";
    for (const model of FREE_MODELS) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert SEO keyword researcher. You analyze real website content to suggest precise, relevant keywords. Return only valid JSON.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          lastError = `${model}: ${response.status}`;
          console.log(`[suggest-keywords] Model failed - ${lastError}`);
          continue;
        }

        const aiData = await response.json();
        content = aiData.choices?.[0]?.message?.content || "";
        if (content) {
          console.log(`[suggest-keywords] Success with model: ${model}`);
          break;
        }
      } catch (e) {
        lastError = `${model}: ${e instanceof Error ? e.message : String(e)}`;
        console.log(`[suggest-keywords] Model error - ${lastError}`);
      }
    }

    if (!content) {
      console.error("[suggest-keywords] All free models failed:", lastError);
      return new Response(
        JSON.stringify({ suggestions: [], fallback: true, error: "AI_SERVICE_UNAVAILABLE" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    // Parse JSON from response
    let suggestions: KeywordSuggestion[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[suggest-keywords] JSON parse error:", e);
      suggestions = [];
    }

    // Filter out existing keywords
    const existingLower = (existingKeywords || []).map((k: string) => k.toLowerCase());
    const newSuggestions = suggestions.filter((s) => !existingLower.includes(s.keyword.toLowerCase()));

    console.log(`[suggest-keywords] Returning ${newSuggestions.length} suggestions (Firecrawl: ${!!firecrawlApiKey})`);

    return new Response(JSON.stringify({ suggestions: newSuggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[suggest-keywords] Error:", error);
    return new Response(
      JSON.stringify({ suggestions: [], fallback: true, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
