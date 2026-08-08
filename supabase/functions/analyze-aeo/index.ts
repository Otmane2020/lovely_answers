import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractSlug(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").replace(/\./g, "-");
  } catch {
    return url.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  }
}

async function scrapeWithFirecrawl(url: string, apiKey: string) {
  console.log("[analyze-aeo] Scraping with Firecrawl:", url);
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "links"],
      onlyMainContent: false,
      waitFor: 3000,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("[analyze-aeo] Firecrawl error:", JSON.stringify(data));
    throw new Error(data.error || `Firecrawl request failed (${res.status})`);
  }
  console.log("[analyze-aeo] Firecrawl scrape successful");
  return data;
}

function buildSystemPrompt() {
  return `Tu es un expert senior en Answer Engine Optimization (AEO) et Generative Search Optimization (GSO).

Tu reçois le contenu scrapé d'un site web. Analyse-le en profondeur pour produire un rapport stratégique complet.

Retourne UNIQUEMENT un JSON valide (pas de texte avant/après, pas de backticks markdown) avec la structure EXACTE suivante :

{
  "companyInfo": {
    "name": "<nom de l'entreprise détecté>",
    "tagline": "<tagline ou proposition de valeur détectée>",
    "sector": "<secteur d'activité>",
    "founded": "<année de création estimée ou 'N/A'>",
    "clients": ["<client1>", "<client2>"],
    "solutions": [
      {
        "name": "<nom du produit/service>",
        "category": "<catégorie>",
        "description": "<description courte>",
        "color": "hsl(217, 91%, 40%)"
      }
    ],
    "kpis": [
      { "label": "<KPI clé>", "value": "<valeur>", "icon": "TrendingUp" }
    ]
  },
  "scores": {
    "global": <0-100>,
    "gso": <0-100>,
    "aeo": <0-100>,
    "schema": <0-100>,
    "content": <0-100>
  },
  "macroAnalysis": {
    "marketTrends": [
      {
        "trend": "<tendance spécifique au secteur>",
        "impact": "Critique|Élevé|Moyen|Faible",
        "score": <0-100>,
        "description": "<explication en 1 phrase>"
      }
    ],
    "competitorLandscape": [
      {
        "name": "<concurrent réel>",
        "presence": <0-100>,
        "strengths": ["<force1>", "<force2>"],
        "weaknesses": ["<faiblesse1>", "<faiblesse2>"]
      }
    ],
    "aiVisibilityScore": {
      "current": <0-100>,
      "target": <0-100>,
      "gap": <number>
    },
    "keyQuestions": [
      {
        "question": "<question spécifique au secteur>",
        "volume": <volume mensuel estimé>,
        "difficulty": "Faible|Moyenne|Élevée",
        "priority": "Critique|Haute|Moyenne|Basse"
      }
    ]
  },
  "microAnalysis": {
    "solutions": [
      {
        "name": "<produit/service du site>",
        "gsoScore": <0-100>,
        "aeoScore": <0-100>,
        "strengths": ["<force1>", "<force2>", "<force3>"],
        "weaknesses": ["<faiblesse1>", "<faiblesse2>", "<faiblesse3>"],
        "opportunities": ["<opportunité1>", "<opportunité2>", "<opportunité3>"],
        "priorityActions": [
          { "action": "<action concrète>", "effort": "Faible|Moyen|Élevé", "impact": "Critique|Élevé|Moyen" }
        ]
      }
    ],
    "contentGaps": [
      { "topic": "<sujet manquant>", "status": "Absent|Partiel|Présent", "priority": "Critique|Haute|Moyenne|Basse" }
    ],
    "schemaAudit": {
      "implemented": ["<schema détecté>"],
      "missing": ["<schema manquant>"],
      "priority": ["<schema prioritaire>"]
    }
  },
  "recommendations": {
    "immediate": [
      {
        "title": "<action immédiate>",
        "description": "<description actionnable>",
        "effort": "<durée estimée>",
        "impact": "Critique|Élevé|Moyen|Faible",
        "kpi": "<KPI cible>"
      }
    ],
    "shortTerm": [
      {
        "title": "<action court terme>",
        "description": "<description actionnable>",
        "effort": "<durée estimée>",
        "impact": "Critique|Élevé|Moyen|Faible",
        "kpi": "<KPI cible>"
      }
    ],
    "longTerm": [
      {
        "title": "<action long terme>",
        "description": "<description actionnable>",
        "effort": "<durée estimée>",
        "impact": "Critique|Élevé|Moyen|Faible",
        "kpi": "<KPI cible>"
      }
    ]
  },
  "kpiTracking": [
    { "metric": "<métrique>", "current": <valeur>, "target": <objectif>, "unit": "<unité>" }
  ]
}

RÈGLES CRITIQUES :
- Génère EXACTEMENT 4 marketTrends spécifiques au secteur du site (pas des tendances génériques)
- Génère EXACTEMENT 4 competitorLandscape entries (3 concurrents réels + le site analysé en dernier)
- Les concurrents doivent être des entreprises RÉELLES et CONNUES du même secteur, pas des noms inventés
- Génère EXACTEMENT 6 keyQuestions avec des volumes réalistes
- Génère au MINIMUM 2 solutions avec 3 forces, 3 faiblesses, 3 opportunités et 3 actions prioritaires chacune
- Génère 5 contentGaps spécifiques au secteur
- Génère EXACTEMENT 3 recommandations immédiates, 3 court terme, 3 long terme
- Génère EXACTEMENT 6 KPIs de tracking
- Les scores doivent être RÉALISTES basés sur le contenu réel du site
- Adapte la langue au marché du site (français si site français, anglais sinon)
- Ne retourne QUE le JSON, sans markdown, sans backticks, sans commentaires`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) throw new Error("URL is required");

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY_CUSTOM") || Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const formattedUrl = (url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const slug = extractSlug(formattedUrl);

    console.log("[analyze-aeo] Analyzing URL:", formattedUrl, "slug:", slug);

    // 1. Check cache
    const { data: existingReport } = await supabase
      .from("reports")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (existingReport) {
      console.log("[analyze-aeo] Cache hit for slug:", slug);
      return new Response(JSON.stringify({ report: existingReport, fromCache: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Scrape with Firecrawl
    let scrapedContent = "";
    let scrapedLinks: string[] = [];
    let scrapedMetadata: Record<string, unknown> = {};
    try {
      const scrapeData = await scrapeWithFirecrawl(formattedUrl, FIRECRAWL_API_KEY);
      scrapedContent = scrapeData?.data?.markdown || scrapeData?.markdown || "";
      scrapedLinks = scrapeData?.data?.links || scrapeData?.links || [];
      scrapedMetadata = scrapeData?.data?.metadata || scrapeData?.metadata || {};
      console.log(`[analyze-aeo] Scraped ${scrapedContent.length} chars, ${scrapedLinks.length} links`);
    } catch (scrapeError) {
      console.warn("[analyze-aeo] Firecrawl failed, trying internal-scraper...", scrapeError);
      // Fallback to internal scraper
      try {
        const scraperRes = await fetch(`${SUPABASE_URL}/functions/v1/internal-scraper`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: formattedUrl, timeout: 12000 }),
        });
        if (scraperRes.ok) {
          const scraperData = await scraperRes.json();
          if (scraperData.success) {
            scrapedContent = scraperData.data?.markdown || "";
            scrapedLinks = scraperData.data?.links || [];
            scrapedMetadata = scraperData.data?.metadata || {};
            console.log(`[analyze-aeo] Internal scraper got ${scrapedContent.length} chars`);
          }
        }
      } catch (internalErr) {
        console.error("[analyze-aeo] Internal scraper also failed:", internalErr);
        scrapedContent = `[Scraping failed — analyze based on the URL: ${formattedUrl}]`;
      }
    }

    // Truncate to avoid token limits
    const truncatedContent = scrapedContent.length > 12000
      ? scrapedContent.slice(0, 12000) + "\n\n[... contenu tronqué ...]"
      : scrapedContent;

    // 3. Call OpenRouter AI
    console.log("[analyze-aeo] Sending to AI for analysis...");
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://autopilotgeo.com",
        "X-Title": "AutoPilot Geo Premium Audit",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          {
            role: "user",
            content: `Analyse ce site pour un audit AEO/GSO complet : ${formattedUrl}

MÉTADONNÉES DU SITE :
- Titre : ${(scrapedMetadata as any)?.title || "N/A"}
- Description : ${(scrapedMetadata as any)?.description || "N/A"}
- Langue : ${(scrapedMetadata as any)?.language || "N/A"}

LIENS TROUVÉS (${scrapedLinks.length} total) :
${scrapedLinks.slice(0, 30).join("\n")}

CONTENU DU SITE :
${truncatedContent}

Analyse ce contenu réel et génère un rapport complet avec des données SPÉCIFIQUES à ce site et son secteur. Ne génère PAS de données génériques. Les concurrents doivent être des entreprises RÉELLES et CONNUES.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errorText = await aiResponse.text();
      console.error("[analyze-aeo] AI error:", status, errorText);
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Trop de requêtes. Réessayez dans quelques instants." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI analysis failed (${status})`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in AI response");

    console.log("[analyze-aeo] AI response received, parsing...");

    // 4. Parse JSON
    let report: Record<string, unknown>;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      report = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("[analyze-aeo] JSON parse error:", parseError, "Preview:", content.slice(0, 500));
      throw new Error("Failed to parse AI response as JSON");
    }

    if (!report.companyInfo || !report.scores || !report.macroAnalysis) {
      throw new Error("AI response missing essential fields");
    }

    console.log("[analyze-aeo] Analysis complete, saving...");

    // 5. Save to DB
    const dbRecord = {
      url: formattedUrl,
      slug,
      company_info: report.companyInfo,
      scores: report.scores,
      macro_analysis: report.macroAnalysis,
      micro_analysis: report.microAnalysis || {},
      recommendations: report.recommendations || {},
      kpi_tracking: report.kpiTracking || [],
    };

    const { data: savedReport, error: dbError } = await supabase
      .from("reports")
      .upsert(dbRecord, { onConflict: "slug" })
      .select()
      .single();

    if (dbError) {
      console.error("[analyze-aeo] DB save error:", dbError);
      return new Response(JSON.stringify({ report: dbRecord, fromCache: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[analyze-aeo] Report saved, id:", savedReport.id);

    return new Response(JSON.stringify({ report: savedReport, fromCache: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[analyze-aeo] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
