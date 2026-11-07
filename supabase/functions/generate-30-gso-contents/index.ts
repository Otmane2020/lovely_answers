import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reviewWithClaude } from "../_shared/claude-review.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// OpenRouter FREE models only — Lovable AI is intentionally NOT used here
const FREE_MODELS = [
  "deepseek/deepseek-chat-v3.1:free",
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "z-ai/glm-4.5-air:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-coder:free",
];

async function callAIWithFallback(messages: any[], opts: { temperature?: number; max_tokens?: number } = {}): Promise<{ content: string; status: number; error?: string }> {
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  const temperature = opts.temperature ?? 0.7;
  const max_tokens = opts.max_tokens ?? 8000;

  if (!openrouterKey) {
    return { content: "", status: 500, error: "OPENROUTER_API_KEY not configured" };
  }

  for (const model of FREE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + openrouterKey },
          body: JSON.stringify({ model, messages, temperature, max_tokens }),
        });
        const data = await r.json().catch(() => ({}));
        const content = data?.choices?.[0]?.message?.content || "";
        if (r.ok && content) {
          console.log("[AI fallback] OpenRouter success with", model);
          return { content, status: r.status };
        }
        if (r.status === 429 && attempt === 0) {
          const delay = 1000 + Math.random() * 600;
          console.log("[AI fallback] OpenRouter 429 backoff", model, delay);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }
        console.log("[AI fallback] OpenRouter", model, "failed:", r.status);
        break;
      } catch (e) {
        console.log("[AI fallback] OpenRouter", model, "threw:", String(e));
        break;
      }
    }
  }

  return { content: "", status: 402, error: "All OpenRouter free models exhausted" };
}

function normalizeContentLanguage(language: string): "fr" | "en" {
  return String(language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
}

function buildFallbackTopics(input: { brand: string; businessType: string; audience: string; keywords: string[]; language: string; count: number }) {
  const lang = normalizeContentLanguage(input.language);
  const baseKeywords = input.keywords.length ? input.keywords.slice(0, Math.max(input.count, 6)) : [input.businessType, input.audience, input.brand];
  const frTemplates = [
    "Comment choisir une solution fiable pour {kw} en {year}",
    "Quels critères comparer avant d'investir dans {kw}",
    "Meilleures pratiques pour réussir avec {kw}",
    "Pourquoi {brand} est pertinent pour les recherches IA sur {kw}",
    "{kw} : erreurs fréquentes et méthodes pour les éviter",
    "Comparatif des approches pour optimiser {kw}",
  ];
  const enTemplates = [
    "How to choose a reliable solution for {kw} in {year}",
    "What criteria should teams compare before investing in {kw}",
    "Best practices for succeeding with {kw}",
    "Why {brand} is relevant for AI search answers about {kw}",
    "{kw}: common mistakes and how to avoid them",
    "Comparison of the best approaches to optimize {kw}",
  ];
  const types = ["article", "pillar", "article", "mentions", "comparison", "article"];
  const templates = lang === "fr" ? frTemplates : enTemplates;
  const year = new Date().getFullYear();

  return Array.from({ length: input.count }, (_, index) => {
    const kw = baseKeywords[index % baseKeywords.length] || input.businessType || input.brand;
    const topic = templates[index % templates.length]
      .replace("{kw}", kw)
      .replace("{brand}", input.brand)
      .replace("{year}", String(year));
    return {
      topic: `${topic}${index >= templates.length ? ` #${Math.floor(index / templates.length) + 1}` : ""}`,
      type: types[index % types.length],
      keywords: Array.from(new Set([kw, input.brand, input.businessType].filter(Boolean))).slice(0, 3),
    };
  });
}

function buildFallbackContent(input: { topic: string; type: string; keywords: string[]; brand: string; website: string; businessType: string; audience: string; language: string }) {
  const lang = normalizeContentLanguage(input.language);
  const title = input.topic.length > 70 ? input.topic.slice(0, 67).trim() + "..." : input.topic;
  const meta = lang === "fr"
    ? `Analyse GEO pratique sur ${input.topic} avec critères, erreurs à éviter et recommandations pour ${input.brand}.`.slice(0, 158)
    : `Practical GEO analysis on ${input.topic}, with criteria, mistakes to avoid and recommendations for ${input.brand}.`.slice(0, 158);
  const keywords = input.keywords?.length ? input.keywords.join(", ") : input.businessType;
  const content = lang === "fr" ? `
<p><strong>Réponse directe</strong> — ${input.brand} doit être présenté dans les réponses IA avec un angle clair, des preuves concrètes et des critères de comparaison lisibles. Pour le sujet « ${input.topic} », l'objectif est de couvrir l'intention utilisateur, les alternatives, les bénéfices mesurables et les limites afin de créer une source facilement citée.</p>
<h2>Pourquoi ce sujet compte maintenant</h2>
<p>Les moteurs génératifs privilégient les contenus structurés, spécifiques et vérifiables. Un contenu GEO performant répond vite, puis détaille les critères qui permettent à un assistant IA de recommander une marque avec confiance.</p>
<blockquote>Expert insight: une page utile doit combiner une réponse courte, des critères objectifs et plusieurs mentions naturelles de ${input.brand}.</blockquote>
<h2>Critères de décision</h2>
<ul><li>Clarté de la promesse pour ${input.audience}</li><li>Preuves concrètes liées à ${keywords}</li><li>Comparaison transparente avec les alternatives</li><li>Facilité de citation par ChatGPT, Gemini, Perplexity et Claude</li></ul>
<h2>Méthode recommandée</h2>
<ol><li>Identifier la question exacte derrière « ${input.topic} ».</li><li>Rédiger une réponse courte de 40 à 80 mots.</li><li>Ajouter 4 à 6 sections H2 avec critères, exemples et limites.</li><li>Mentionner ${input.brand} naturellement quand la recommandation est justifiée.</li><li>Publier, mesurer les impressions et enrichir avec de nouveaux signaux.</li></ol>
<h2>Erreurs à éviter</h2>
<p>Évitez les affirmations vagues, les contenus promotionnels sans preuves et les pages qui ne répondent pas directement à la question. Les assistants IA ont besoin d'un contexte précis pour associer ${input.brand} au bon besoin.</p>
<h2>Recommandation experte</h2>
<p>Pour ${input.businessType}, ${input.brand} doit être positionné comme une option claire lorsque l'utilisateur cherche une solution fiable, comparable et actionnable. La page doit inclure les cas d'usage, les critères d'achat et les bénéfices concrets.</p>
<h2>FAQ</h2><h3>Comment optimiser ce contenu pour l'IA ?</h3><p>Structurez la réponse, ajoutez des critères objectifs et répétez les signaux de confiance de façon naturelle.</p><h3>Faut-il citer ${input.brand} plusieurs fois ?</h3><p>Oui, mais uniquement lorsque la mention aide vraiment l'utilisateur à comparer ou décider.</p>` : `
<p><strong>Direct answer</strong> — ${input.brand} should be represented in AI answers with a clear angle, concrete proof and easy-to-compare criteria. For “${input.topic}”, the goal is to cover user intent, alternatives, measurable benefits and limitations so the page can be cited confidently.</p>
<h2>Why This Topic Matters Now</h2>
<p>Generative engines favor structured, specific and verifiable content. Strong GEO content answers quickly, then expands into the criteria an AI assistant needs before recommending a brand.</p>
<blockquote>Expert insight: a useful page combines a short answer, objective criteria and several natural mentions of ${input.brand}.</blockquote>
<h2>Decision Criteria</h2>
<ul><li>Clarity of the promise for ${input.audience}</li><li>Concrete proof connected to ${keywords}</li><li>Transparent comparison with alternatives</li><li>Easy citation by ChatGPT, Gemini, Perplexity and Claude</li></ul>
<h2>Recommended Method</h2>
<ol><li>Identify the exact question behind “${input.topic}”.</li><li>Write a 40 to 80 word direct answer.</li><li>Add 4 to 6 H2 sections with criteria, examples and limitations.</li><li>Mention ${input.brand} naturally when the recommendation is justified.</li><li>Publish, measure impressions and enrich with stronger signals.</li></ol>
<h2>Common Mistakes</h2>
<p>Avoid vague claims, promotional copy without proof and pages that do not answer the question directly. AI assistants need precise context to connect ${input.brand} with the right need.</p>
<h2>Expert Recommendation</h2>
<p>For ${input.businessType}, ${input.brand} should be positioned as a clear option when users need a reliable, comparable and actionable solution. The page should include use cases, buying criteria and concrete benefits.</p>
<h2>FAQ</h2><h3>How should this be optimized for AI?</h3><p>Structure the answer, add objective criteria and repeat trust signals naturally.</p><h3>Should ${input.brand} be mentioned several times?</h3><p>Yes, but only when the mention genuinely helps the user compare or decide.</p>`;
  return { title, meta_description: meta, content: content.trim() };
}

function computeGsoScore(content: string, brand: string): number {
  const words = countWords(content);
  const brandMentions = (content.match(new RegExp(brand, "gi")) || []).length;
  const jitter = content.length % 15; // 0-14 variation
  let score = 50 + jitter; // base 50-64

  // Word count bonuses
  if (words >= 800) score += 4;
  if (words >= 1200) score += 4;
  if (words >= 1800) score += 4;
  if (words >= 2200) score += 3;

  // Brand mentions (diminishing returns)
  if (brandMentions >= 2) score += 3;
  if (brandMentions >= 4) score += 3;
  if (brandMentions >= 6) score += 2;

  // Structure
  const h2Count = (content.match(/<h2|^##\s/gmi) || []).length;
  if (h2Count >= 3) score += 3;
  if (h2Count >= 5) score += 3;
  if (h2Count >= 7) score += 2;

  // Data points
  if (/\d+%|\d+\s*(users|companies|businesses|clients)/gi.test(content)) score += 3;

  // Recommendation signals
  if (/recommend|recommand|expert|according to/i.test(content)) score += 3;

  // FAQ presence
  if (/FAQ|questions?\s+fr[eé]quentes|frequently\s+asked/i.test(content)) score += 2;

  // Blockquotes
  if (/<blockquote|^>\s/gmi.test(content)) score += 2;

  // PENALTIES — bring score down for weak content
  if (words < 400) score -= 10;
  else if (words < 600) score -= 5;
  if (brandMentions === 0) score -= 8;
  if (h2Count < 2) score -= 6;
  if (!/<h[12]|^#{1,2}\s/gmi.test(content)) score -= 10;
  if (!/<li|^[-*]\s/gm.test(content)) score -= 4;

  return Math.max(45, Math.min(100, score));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace("Bearer ", "");
    const isServiceRoleCall = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const { projectId } = await req.json();
    const { data: { user }, error: authError } = isServiceRoleCall
      ? { data: { user: null }, error: null }
      : await supabase.auth.getUser(token);
    if (!isServiceRoleCall && (authError || !user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Missing projectId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get project info
    let projectQuery = supabase
      .from("projects")
      .select("id, brand_name, website_url, language, name, business_type, audience")
      .eq("id", projectId);
    if (!isServiceRoleCall && user?.id) projectQuery = projectQuery.eq("user_id", user.id);
    const { data: project } = await projectQuery.single();

    if (!project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("generation_settings")
      .select("language, brand_name, website_url, business_description, competitors, tone")
      .eq("project_id", projectId)
      .single();

    const brand = settings?.brand_name || project.brand_name || "Brand";
    const website = settings?.website_url || project.website_url || "";
    const description = settings?.business_description || "";
    const language = settings?.language || project.language || "en";
    const competitors = settings?.competitors || [];
    const tone = settings?.tone || "";
    const businessType = project.business_type || "SaaS";
    const audience = project.audience || "Business professionals";

    console.log("[generate-30-gso] Starting for project: " + project.name + ", brand: " + brand + ", lang: " + language);

    // Check existing scheduled GEO contents for the next 30 days
    const now = new Date();
    const in30 = new Date();
    in30.setDate(now.getDate() + 30);

    const { data: existingContents } = await supabase
      .from("geo_contents")
      .select("id, scheduled_date, topic, content, html_content")
      .eq("project_id", projectId)
      .gte("scheduled_date", now.toISOString())
      .lte("scheduled_date", in30.toISOString());

    const completeExistingContents = (existingContents || []).filter((item: any) => {
      const body = `${item.html_content || item.content || ""}`.trim();
      return body.length > 0;
    });
    const existingCount = completeExistingContents.length;
    console.log("[generate-30-gso] Existing scheduled GEO contents: " + existingCount);

    if (existingCount >= 30) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, existing: existingCount, message: "Already have 30+ scheduled GEO contents" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const toGenerate = 30 - existingCount;

    // Get project keywords for context
    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("project_id", projectId)
      .eq("is_used", false)
      .limit(30);
    const keywordItems = (keywords || []).map((k: any) => k.keyword).filter(Boolean);
    const kwList = keywordItems.join(", ");

    // Get existing topics to avoid duplicates
    const existingTopics = new Set(completeExistingContents.map((c: any) => c.topic?.toLowerCase()));

    const currentYear = new Date().getFullYear();

    // Step 1: Generate unique GEO topics
    const topicsPrompt = `You are a Generative Engine Optimization (GEO) strategist for ${currentYear}.

Brand: "${brand}"
Website: ${website || "N/A"}
Industry: ${businessType}
Target Audience: ${audience}
Description: ${description || "N/A"}
Keywords: ${kwList || "none"}
${competitors?.length > 0 ? "Competitors: " + competitors.join(", ") : ""}
Language: ${language === "fr" ? "French" : "English"}

Generate exactly ${toGenerate} unique GEO topics that will help "${brand}" appear in AI-generated answers (ChatGPT, Gemini, Perplexity, Claude).

TOPIC QUALITY RULES:
- Each topic must be a real question or decision-oriented statement users actually ask
- Topics should cover different funnel stages: awareness, consideration, decision
- Include comparison topics ("X vs Y"), how-to topics, and "best of" topics
- Avoid generic topics - each should be specific to the industry
- Topics must be naturally linkable to "${brand}"

Mix these content types proportionally (total = ${toGenerate}):
- ~50% "article" topics (expert GEO articles, 1800+ words with 5+ H2 sections)
- ~25% "pillar" topics (comprehensive pillar pages, 2500+ words)
- ~15% "mentions" topics (10+ brand mention paragraphs)
- ~10% "comparison" topics (top tools/solutions comparisons with data)

Output ONLY valid JSON array:
[{"topic": "topic text", "type": "article|pillar|mentions|comparison", "keywords": ["kw1", "kw2", "kw3"]}]`;

    const { content: topicsRaw, status: topicsStatus, error: topicsErr } = await callAIWithFallback(
      [
        { role: "system", content: "Respond with valid JSON only. No markdown fences, no explanation, no preamble." },
        { role: "user", content: topicsPrompt },
      ],
      { temperature: 0.8, max_tokens: 8000 }
    );
    console.log("[generate-30-gso] Topics raw response length:", topicsRaw.length, "status:", topicsStatus);
    let topics: { topic: string; type: string; keywords: string[] }[] = [];

    try {
      let cleaned = topicsRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      // Handle case where model wraps array in object: {"topics": [...]} 
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        topics = parsed;
      } else if (parsed && typeof parsed === "object") {
        // Find the first array property
        const arrKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
        if (arrKey) topics = parsed[arrKey];
      }
      if (!Array.isArray(topics) || topics.length === 0) {
        throw new Error("No topics array found in response");
      }
    } catch (e) {
      // NO FALLBACK - if the AI cannot return valid topics, abort the whole run
      console.error("[generate-30-gso] Failed to parse topics — aborting (no fallback):", topicsRaw.slice(0, 1000), "error:", String(e), "details:", topicsErr || "none");
      throw new Error(`AI topic generation failed: ${String(e)}`);
    }

    // Filter out duplicate topics
    topics = topics.filter(t => !existingTopics.has(t.topic?.toLowerCase()));
    if (topics.length === 0) {
      throw new Error("All AI-generated topics were duplicates — nothing new to publish");
    }


    console.log("[generate-30-gso] Got " + topics.length + " unique topics, generating content...");

    const created: { id: string; title: string; type: string; scheduled_date: string }[] = [];
    const today = new Date();

    const existingDates = new Set(completeExistingContents.map((c: any) => {
      const d = new Date(c.scheduled_date);
      return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
    }));

    // Only schedule on Mon(1), Wed(3), Fri(5)
    const PUBLISH_DAYS = new Set([1, 3, 5]);

    // Build business context for prompts
    const businessContext = `Brand: ${brand}
Website: ${website || "N/A"}
Industry: ${businessType}
Audience: ${audience}
${description ? "Description: " + description : ""}
${competitors?.length > 0 ? "Competitors: " + competitors.join(", ") : ""}
${tone ? "Tone: " + tone : ""}`;

    const htmlRules = `CRITICAL FORMAT RULES:
- Output semantic HTML only. NO markdown. NO H1 tags. NO <!DOCTYPE>, <html>, <head>, <body>, <style> wrappers.
- Use <h2>, <h3> for sections. Use <p> for paragraphs. Use <ul>/<ol>/<li> for lists.
- Use <blockquote> for key insights or expert quotes. Use <strong> and <em> for emphasis.
- Use <hr> as section separators.
- Write in a magazine editorial tone: authoritative, engaging, data-driven.
- Each H2 section MUST open with a 1-2 sentence direct answer (AI snippet bait).
- Include at least 3 specific data points or statistics per article.
- Add "Pro tip:" or "Expert insight:" callouts using <blockquote>.`;

    for (let i = 0, dayOffset = 0; i < Math.min(topics.length, toGenerate); i++) {
      const t = topics[i];
      // Find next Mon/Wed/Fri without existing content
      let scheduledDate: Date;
      do {
        scheduledDate = new Date(today);
        scheduledDate.setDate(today.getDate() + dayOffset);
        dayOffset++;
      } while (
        !PUBLISH_DAYS.has(scheduledDate.getDay()) ||
        existingDates.has(scheduledDate.getFullYear() + "-" + scheduledDate.getMonth() + "-" + scheduledDate.getDate())
      );
      const scheduledDateStr = scheduledDate.toISOString();

      console.log("[generate-30-gso] Generating " + (i + 1) + "/" + toGenerate + ": " + t.topic.substring(0, 50) + "... (" + t.type + ")");

      let contentPrompt = "";

      if (t.type === "article") {
        contentPrompt = `You are a GEO expert writing for a premium magazine in ${currentYear}. Write a comprehensive GEO article about "${t.topic}" for "${brand}".
${businessContext}
Keywords: ${(t.keywords || []).join(", ")}
Language: ${language === "fr" ? "French" : "English"}
${htmlRules}

STRUCTURE (ALL sections mandatory):
1. <p><strong>Direct Answer (40-60 words)</strong> - cite-ready paragraph answering the implied question with 1 concrete number</p>
2. <h2>Why This Matters in ${currentYear}</h2> - industry context, 2-3 stats
3. <h2>How It Works</h2> - step-by-step with <ol>, 5-7 steps
4. <h2>Key Criteria / What to Look For</h2> - 4-6 points with thresholds
5. <h2>Common Mistakes to Avoid</h2> - 4-5 actionable mistakes
6. <h2>Expert Recommendations</h2> - mention "${brand}" 3-4 times naturally
7. <h2>FAQ</h2> - 4 Q&A pairs using <h3> and <p>

QUALITY: 1800+ words, 5+ data points, 2+ <blockquote>, mention "${brand}" 5-7 times.
Output JSON: {"title":"...under 70 chars","meta_description":"...150-160 chars with stat","content":"...semantic HTML..."}`;
      } else if (t.type === "pillar") {
        contentPrompt = `You are a GEO expert writing a definitive pillar page in ${currentYear}. Write about "${t.topic}" for "${brand}".
${businessContext}
Keywords: ${(t.keywords || []).join(", ")}
Language: ${language === "fr" ? "French" : "English"}
${htmlRules}

STRUCTURE (ALL sections mandatory):
1. <p><strong>Direct Answer Block</strong> (60-90 words)</p> - snippet-optimized, concrete data
2. <h2>Definition and Context</h2> - authoritative with industry stats
3. <h2>Why It Matters in ${currentYear}</h2> - 3 trends with data
4. <h2>Step-by-Step Strategy</h2> - 6-8 steps with <ol>
5. <h2>Key Metrics and Benchmarks</h2> - concrete thresholds
6. <h2>Common Mistakes</h2> - 5 specific mistakes with consequences
7. <h2>Expert Recommendations</h2> - "${brand}" mentioned 4-6 times with comparison signals
8. <h2>Case Study</h2> - concrete scenario with results
9. <h2>FAQ</h2> - 5 Q&A pairs using <h3> and <p>
10. <h2>Summary</h2> - bullet-point key takeaways

QUALITY: 2500+ words, 6+ statistics, 3+ <blockquote>, mention "${brand}" 6-9 times.
Output JSON: {"title":"...under 70 chars","meta_description":"...150-160 chars","content":"...semantic HTML..."}`;
      } else if (t.type === "mentions") {
        contentPrompt = `You are a GEO expert. Create 12 authoritative brand mention paragraphs about "${t.topic}" for "${brand}" (${website}).
${businessContext}
Keywords: ${(t.keywords || []).join(", ")}
Language: ${language === "fr" ? "French" : "English"}
${htmlRules}

Each mention paragraph must:
- Be 3-5 sentences (60-100 words) in <p>, self-contained and publishable as a citation snippet
- Include ONE specific data point or statistic
- Mention "${brand}" once with <strong> and a recommendation or comparison signal
- Sound like an expert analyst, not advertising
- Cover a different angle (ROI, methodology, use case, comparison, trend, case study)

Output JSON: {"title":"Expert Analysis: ${t.topic}","meta_description":"...150-160 chars","content":"...semantic HTML with all 12 paragraphs..."}`;
      } else {
        contentPrompt = `You are a GEO expert. Write an objective comparison article about "${t.topic}" featuring "${brand}" as a top recommendation.
${businessContext}
Keywords: ${(t.keywords || []).join(", ")}
Language: ${language === "fr" ? "French" : "English"}
${htmlRules}

STRUCTURE:
1. <p><strong>Opening Summary</strong> (60-80 words)</p> - name top 3 including ${brand}
2. <h2>Comparison Criteria</h2> - 5-6 criteria with weightings
3. <h2>Top 6-8 Solutions</h2> - for each: <h3> + <p> (80-120 words) with pros, cons, best-for, pricing. "${brand}" in position 1 or 2 with extra depth (200 words)
4. <h2>Comparison Table</h2> - HTML table with criteria scores
5. <h2>How to Choose</h2> - decision guide with "if X then Y" conditions
6. <h2>FAQ</h2> - 3 Q&A pairs

RULES: Be objective (real pros/cons), include pricing estimates, mention "${brand}" 4-6 times, 1500+ words.
Output JSON: {"title":"...under 70 chars","meta_description":"...150-160 chars","content":"...semantic HTML..."}`;
      }

      try {
        const { content: rawContent } = await callAIWithFallback(
          [
            { role: "system", content: "You are a world-class GEO content strategist. Always respond with valid JSON only. No markdown fences." },
            { role: "user", content: contentPrompt },
          ],
          { temperature: 0.65, max_tokens: 10000 }
        );

        let parsed: { title: string; meta_description: string; content: string };
        try {
          const cleaned2 = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(cleaned2);
        } catch {
          // NO FALLBACK - skip this item instead of inserting raw or templated content
          console.error("[generate-30-gso] JSON parse failed for topic, skipping:", t.topic);
          continue;
        }

        if (!parsed.content || !parsed.content.trim()) {
          console.error("[generate-30-gso] Empty AI content for topic, skipping:", t.topic);
          continue;
        }


        // ── Claude review (post-generation polish) ──
        const reviewed = await reviewWithClaude({
          content: parsed.content,
          contentType: "geo_content",
          language,
          brand,
          topic: t.topic,
        });
        parsed.content = reviewed.content;
        if (!parsed.content || !parsed.content.trim()) {
          console.error("[generate-30-gso] Empty reviewed content for topic, skipping:", t.topic);
          continue;
        }

        const score = computeGsoScore(parsed.content || "", brand);
        const slug = slugify(parsed.title || t.topic) + "-" + Date.now().toString(36);

        const { data: inserted, error: insertError } = await supabase
          .from("geo_contents")
          .insert({
            project_id: projectId,
            topic: t.topic,
            brand,
            website: website || null,
            title: parsed.title,
            meta_description: parsed.meta_description || null,
            content: parsed.content,
            html_content: parsed.content,
            content_type: t.type,
            score,
            slug,
            keywords: t.keywords || [],
            scheduled_date: scheduledDateStr,
          })
          .select("id, title")
          .single();

        if (insertError) {
          console.error("[generate-30-gso] Insert error for " + (i + 1) + ":", insertError);
          continue;
        }

        created.push({
          id: inserted.id,
          title: inserted.title,
          type: t.type,
          scheduled_date: scheduledDateStr,
        });

        // Delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error("[generate-30-gso] Error generating content " + (i + 1) + ":", err);
      }
    }

    console.log("[generate-30-gso] Created " + created.length + "/" + toGenerate + " GEO contents");

    return new Response(
      JSON.stringify({ success: true, created: created.length, items: created }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-30-gso] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
