// supabase/functions/serp-first/index.ts
// TrySoro-style SERP-first competitor discovery + AEO answer generation
// Flow: DataForSEO SERP -> Top 3-4 domains -> Firecrawl scrape (fast) -> OpenRouter AI summary
// Input: { query: "vendre un canapé", lang?: "fr", country?: "FR", limit?: 4 }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SerpResult = {
  domain: string;
  url?: string;
  title?: string;
  snippet?: string;
  rank?: number;
};

type CompetitorCard = {
  domain: string;
  url: string;
  title?: string;
  snippet?: string;
  extracted?: {
    pageTitle?: string;
    metaDescription?: string;
    markdownPreview?: string;
  };
};

function safeJson(res: Response) {
  return res
    .json()
    .catch(() => ({} as Record<string, unknown>));
}

function normDomain(d: string) {
  return d.replace(/^www\./, "").trim().toLowerCase();
}

function isLikelyDirectoryOrBlog(domain: string) {
  // Keep it permissive; we only filter obvious junk.
  const bad = [
    "wikipedia.org",
    "reddit.com",
    "quora.com",
    "youtube.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "pinterest.com",
    "tiktok.com",
  ];
  const nd = normDomain(domain);
  if (bad.includes(nd)) return true;
  return false;
}

function getDfLocationCode(country: string) {
  // Minimal mapping; extend as needed.
  const map: Record<string, number> = {
    FR: 2250,
    DE: 2276,
    ES: 2724,
    IT: 2380,
    US: 2840,
    GB: 2826,
  };
  return map[country] ?? 2250;
}

function getDfLanguageCode(lang: string) {
  const l = (lang || "fr").toLowerCase();
  if (l.startsWith("fr")) return "fr";
  if (l.startsWith("de")) return "de";
  if (l.startsWith("es")) return "es";
  if (l.startsWith("it")) return "it";
  if (l.startsWith("pt")) return "pt";
  return "en";
}

async function dataforseoSerpTopDomains(
  query: string,
  country: string,
  lang: string,
  limit: number,
  dfLogin: string,
  dfPassword: string
): Promise<SerpResult[]> {
  const auth = btoa(`${dfLogin}:${dfPassword}`);
  const location_code = getDfLocationCode(country);
  const language_code = getDfLanguageCode(lang);

  const body = [
    {
      keyword: query,
      location_code,
      language_code,
      depth: Math.max(10, limit * 3),
    },
  ];

  console.log('[SERP-FIRST] DataForSEO query:', query, 'location:', location_code, 'lang:', language_code);

  const res = await fetch(
    "https://api.dataforseo.com/v3/serp/google/organic/live/regular",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const json = await safeJson(res);

  if (!res.ok || (json as any)?.status_code !== 20000) {
    console.error("[SERP-FIRST] DataForSEO Error:", json);
    return [];
  }

  const items = (json as any)?.tasks?.[0]?.result?.[0]?.items ?? [];
  const results: SerpResult[] = [];

  for (const item of items) {
    if (item?.type !== "organic") continue;
    const domain = item?.domain;
    const url = item?.url;
    if (!domain || !url) continue;
    results.push({
      domain,
      url,
      title: item?.title,
      snippet: item?.description,
      rank: item?.rank_group,
    });
    if (results.length >= limit * 2) break; // Get extra for filtering
  }

  console.log('[SERP-FIRST] Found', results.length, 'SERP results');
  return results;
}

async function firecrawlScrapeFast(
  url: string,
  firecrawlKey: string
): Promise<{ title?: string; description?: string; markdown?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 12000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await safeJson(res);
      console.error("[SERP-FIRST] Firecrawl scrape failed:", err);
      return {};
    }

    const json = await safeJson(res);
    const md = (json as any)?.data?.markdown ?? "";
    const meta = (json as any)?.data?.metadata ?? {};

    return {
      title: meta?.title,
      description: meta?.description || meta?.ogDescription,
      markdown: md,
    };
  } catch (e) {
    clearTimeout(timeout);
    console.error("[SERP-FIRST] Firecrawl error:", e);
    return {};
  }
}

async function lovableGenerateAnswer(
  query: string,
  competitors: CompetitorCard[],
  lang: string,
  lovableKey: string
): Promise<{
  best: Array<{ domain: string; why: string; fit_score: number }>;
  answer: string;
  seo_titles: string[];
  qa: Array<{ question: string; short: string; answer: string; title: string }>;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const langInstruction =
    lang.startsWith("fr")
      ? "Réponds en FRANÇAIS."
      : "Respond in ENGLISH.";

  const compact = competitors.map((c) => ({
    domain: c.domain,
    url: c.url,
    serpTitle: c.title,
    serpSnippet: c.snippet,
    pageTitle: c.extracted?.pageTitle,
    pageDesc: c.extracted?.metaDescription,
    mdPreview: (c.extracted?.markdownPreview || "").slice(0, 800),
  }));

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          {
            role: "user",
            content: `You are a SERP-first resale assistant (TrySoro-style).

Task: Given a user query about selling a specific item (e.g., "vendre un canapé"), pick the top 3-4 best platforms from the SERP results and explain why.

User query: "${query}"

Candidate platforms (SERP + scraped previews):
${JSON.stringify(compact, null, 2)}

Rules:
- Prefer platforms where a user can SELL (transactional intent)
- Avoid pure informational articles unless no platform exists
- Produce very practical recommendations (what to do next)
- Output must be structured and concise
- Also generate AEO-friendly Q&A and SEO titles (≤60 chars)

${langInstruction}

Return ONLY JSON:
{
  "best": [{"domain":"...","why":"...","fit_score":0-100}],
  "answer":"...",
  "seo_titles":["...","...","..."],
  "qa":[
    {"question":"...","short":"...","answer":"...","title":"..."}
  ]
}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1400,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await safeJson(res);
      console.error("[SERP-FIRST] OpenRouter AI error:", err);
      return { best: [], answer: "", seo_titles: [], qa: [] };
    }

    const json = await safeJson(res);
    const text = (json as any)?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log('[SERP-FIRST] No JSON found in AI response');
      return { best: [], answer: "", seo_titles: [], qa: [] };
    }

    const parsed = JSON.parse(match[0]);
    console.log('[SERP-FIRST] AI generated', parsed.best?.length || 0, 'recommendations');
    return parsed;
  } catch (e) {
    clearTimeout(timeout);
    console.error("[SERP-FIRST] AI error:", e);
    return { best: [], answer: "", seo_titles: [], qa: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    const lang = String(body?.lang || "fr").toLowerCase();
    const country = String(body?.country || "FR").toUpperCase();
    const limit = Math.min(4, Math.max(3, Number(body?.limit || 4)));

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: "query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('[SERP-FIRST] Processing query:', query, 'lang:', lang, 'country:', country);

    const dfLogin = Deno.env.get("DATAFORSEO_LOGIN");
    const dfPassword = Deno.env.get("DATAFORSEO_PASSWORD");
    const firecrawlKey =
      Deno.env.get("FIRECRAWL_API_KEY_CUSTOM") || Deno.env.get("FIRECRAWL_API_KEY");
    const lovableKey = Deno.env.get("OPENROUTER_API_KEY");

    if (!dfLogin || !dfPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "DataForSEO not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OpenRouter AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startTime = Date.now();

    // 1) SERP-first: Get top domains from DataForSEO
    const serp = await dataforseoSerpTopDomains(query, country, lang, limit, dfLogin, dfPassword);

    // Filter obvious junk (social media, wikipedia, etc.)
    const filtered = serp
      .map((r) => ({ ...r, domain: normDomain(r.domain) }))
      .filter((r) => !isLikelyDirectoryOrBlog(r.domain));

    console.log('[SERP-FIRST] After filtering:', filtered.length, 'candidates');

    // 2) Firecrawl scrape fast for each top URL (parallel)
    const scrapePromises = filtered.slice(0, limit).map(async (r) => {
      const scraped = await firecrawlScrapeFast(r.url!, firecrawlKey);
      return {
        domain: normDomain(r.domain),
        url: r.url!,
        title: r.title,
        snippet: r.snippet,
        extracted: {
          pageTitle: scraped.title,
          metaDescription: scraped.description,
          markdownPreview: (scraped.markdown || "").slice(0, 1200),
        },
      } as CompetitorCard;
    });

    const competitorCards = await Promise.all(scrapePromises);
    console.log('[SERP-FIRST] Scraped', competitorCards.length, 'pages');

    // 3) AI final response + AEO kit
    const ai = await lovableGenerateAnswer(query, competitorCards, lang, lovableKey);

    console.log('[SERP-FIRST] Total time:', Date.now() - startTime, 'ms');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          query,
          country,
          lang,
          serp_top: competitorCards.map((c) => ({
            domain: c.domain,
            url: c.url,
            title: c.title,
          })),
          best: ai.best,
          answer: ai.answer,
          seo_titles: ai.seo_titles,
          qa: ai.qa,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[SERP-FIRST] Error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
