import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function scoreArticle(content: string, brand: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  const words = countWords(content);

  if (words < 1800) { score -= 30; issues.push("Too short: " + words + " words (min 1800)"); }
  const h2Count = (content.match(/^#{2}\s|<h2/gmi) || []).length;
  if (h2Count < 5) { score -= 20; issues.push("Only " + h2Count + " H2 sections (min 5)"); }
  if (!/\d+%|\d+ (studies|users|companies|businesses)/gi.test(content)) { score -= 15; issues.push("No data points"); }
  if ((content.match(/\?/g) || []).length < 5) { score -= 10; issues.push("Weak FAQ section"); }
  const h3Count = (content.match(/^#{3}\s|<h3/gmi) || []).length;
  if (h3Count < 3) { score -= 5; issues.push("Few H3 subsections"); }
  const brandMentions = brand ? (content.match(new RegExp(brand, "gi")) || []).length : 0;
  if (brandMentions < 3) { score -= 5; issues.push("Low brand mentions"); }
  if (!/for example|for instance|such as|par exemple|comme|notamment/gi.test(content)) { score -= 5; issues.push("No examples"); }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { articleId, bulkRewrite } = body;

    // --- BULK REWRITE MODE ---
    if (bulkRewrite === true) {
      const projectId = body.projectId;
      if (!projectId) {
        return new Response(JSON.stringify({ error: "Missing projectId for bulk rewrite" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: project } = await supabase.from("projects").select("brand_name, name").eq("id", projectId).single();
      const brand = project?.brand_name || project?.name || "Brand";

      // Fetch all articles for this project
      const { data: articles, error: fetchErr } = await supabase
        .from("articles")
        .select("id, title, content, aeo_score, word_count")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (fetchErr || !articles) {
        return new Response(JSON.stringify({ error: "Failed to fetch articles" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results: any[] = [];
      let rewrittenCount = 0;
      let skippedCount = 0;

      for (const art of articles) {
        const content = art.content || "";
        const { score: currentScore } = scoreArticle(content, brand);

        if (currentScore >= 70) {
          skippedCount++;
          results.push({ id: art.id, title: art.title, oldScore: currentScore, action: "skipped" });
          continue;
        }

        // Rewrite this article
        try {
          const rewriteResult = await rewriteSingleArticle(supabase, openRouterKey, art.id, brand);
          rewrittenCount++;
          results.push({
            id: art.id,
            title: art.title,
            oldScore: currentScore,
            newScore: rewriteResult.newScore,
            action: "rewritten",
          });
        } catch (err) {
          results.push({ id: art.id, title: art.title, oldScore: currentScore, action: "error", error: String(err) });
        }

        // Rate limiting
        await new Promise((r) => setTimeout(r, 1000));
      }

      const avgOldScore = results.filter(r => r.oldScore).reduce((s, r) => s + r.oldScore, 0) / (results.length || 1);
      const rewrittenResults = results.filter(r => r.newScore);
      const avgNewScore = rewrittenResults.length > 0
        ? rewrittenResults.reduce((s, r) => s + r.newScore, 0) / rewrittenResults.length
        : 0;

      return new Response(JSON.stringify({
        success: true,
        totalArticles: articles.length,
        rewritten: rewrittenCount,
        skipped: skippedCount,
        averageOldScore: Math.round(avgOldScore),
        averageNewScore: Math.round(avgNewScore),
        results,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- SINGLE ARTICLE REWRITE ---
    if (!articleId) {
      return new Response(JSON.stringify({ error: "Missing articleId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: article, error: artErr } = await supabase
      .from("articles")
      .select("*, projects(brand_name, name, website_url, business_type, audience)")
      .eq("id", articleId)
      .single();

    if (artErr || !article) {
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brand = article.projects?.brand_name || article.projects?.name || "Brand";
    const oldContent = article.content || "";
    const { score: oldScore, issues: oldIssues } = scoreArticle(oldContent, brand);

    if (oldScore >= 70) {
      return new Response(JSON.stringify({
        success: true,
        message: "Article already meets quality threshold",
        oldScore,
        articleId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await rewriteSingleArticle(supabase, openRouterKey, articleId, brand);

    return new Response(JSON.stringify({
      success: true,
      articleId,
      oldScore,
      oldIssues,
      newScore: result.newScore,
      newIssues: result.newIssues,
      newWordCount: result.newWordCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[rewrite-article] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function rewriteSingleArticle(
  supabase: any,
  openRouterKey: string,
  articleId: string,
  brand: string
): Promise<{ newScore: number; newIssues: string[]; newWordCount: number }> {
  const { data: article, error } = await supabase
    .from("articles")
    .select("*, projects(brand_name, name, website_url, business_type, audience)")
    .eq("id", articleId)
    .single();

  if (error || !article) throw new Error("Article not found: " + articleId);

  const website = article.projects?.website_url || "";
  const businessType = article.projects?.business_type || "SaaS";
  const audience = article.projects?.audience || "Business professionals";
  const title = article.title || "Untitled";
  const oldContent = article.content || "";
  const language = /[a-zA-Z]{3,}/.test(oldContent.slice(0, 200)) ? "en" : "fr";

  const rewritePrompt = `You are rewriting a low-quality article to make it comprehensive, authoritative, and optimized for both SEO and AI citation.

CURRENT ARTICLE TITLE: "${title}"

CURRENT ARTICLE (to be completely rewritten and expanded):
${oldContent.slice(0, 3000)}

BRAND: "${brand}"
WEBSITE: ${website}
INDUSTRY: ${businessType}
AUDIENCE: ${audience}

REWRITE REQUIREMENTS:
1. Keep the same topic and title but completely rewrite the content
2. Expand to 1800-2200 words MINIMUM
3. Add 5+ H2 sections with H3 subsections
4. Include 5+ real data points and statistics
5. Add concrete examples and case studies
6. Add a FAQ section with 5 real questions
7. Mention "${brand}" naturally 5-8 times
8. Write in ${language === "fr" ? "French" : "English"}
9. Each section must start with a direct answer sentence
10. Include "Pro tip:" callouts

Respond in JSON:
{
  "content": "Full rewritten article in markdown (## for H2, ### for H3). 1800-2200 words.",
  "metaDescription": "New meta description 150-160 chars",
  "faqs": [{"question": "...", "answer": "80-120 word answer"}]
}`;

  const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + openRouterKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        { role: "system", content: "You are an expert SEO content writer. Rewrite articles to be comprehensive, data-rich, and optimized for AI citation. Always respond with valid JSON only." },
        { role: "user", content: rewritePrompt },
      ],
      temperature: 0.6,
      max_tokens: 8000,
    }),
  });

  if (!aiRes.ok) throw new Error("AI API error: " + aiRes.status);

  const aiData = await aiRes.json();
  const rawContent = aiData.choices?.[0]?.message?.content || "";

  let parsed: any;
  try {
    const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { content: rawContent, metaDescription: "", faqs: [] };
  }

  const newContent = parsed.content || rawContent;
  const newWordCount = countWords(newContent);
  const { score: newScore, issues: newIssues } = scoreArticle(newContent, brand);

  // Update article with rewritten content, set as draft for review
  await supabase
    .from("articles")
    .update({
      content: newContent,
      meta_description: parsed.metaDescription || article.meta_description,
      word_count: newWordCount,
      aeo_score: newScore,
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  console.log("[rewrite-article] Rewritten " + articleId + " | oldWords=" + countWords(article.content || "") + " newWords=" + newWordCount + " | score=" + newScore);

  return { newScore, newIssues, newWordCount };
}
