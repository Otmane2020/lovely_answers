import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reviewWithClaude } from "../_shared/claude-review.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ArticleRequest {
  projectId: string;
  keywords: string[];
  language?: string;
  count?: number;
}

// --- Helpers ---

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

// --- Quality scoring system ---

function scoreArticle(content: string, brand: string, faqs: any[]): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  const words = countWords(content);

  // 1. Word count check (min 1800 words)
  if (words < 1800) {
    score -= 30;
    issues.push("Too short: " + words + " words (min 1800)");
  } else if (words < 1500) {
    score -= 40;
    issues.push("Way too short: " + words + " words (min 1800)");
  }

  // 2. H2 sections (min 5)
  const h2Count = (content.match(/^#{2}\s|<h2/gmi) || []).length;
  if (h2Count < 5) {
    score -= 20;
    issues.push("Only " + h2Count + " H2 sections (min 5)");
  }

  // 3. Data points and statistics
  const hasDataPoints = /\d+%|\d+ (studies|users|companies|businesses|clients|customers)|\d+x|\$\d+|\d+ (million|billion|thousand)/gi.test(content);
  if (!hasDataPoints) {
    score -= 15;
    issues.push("No data points or statistics found");
  }

  // 4. FAQ section
  const questionMarks = (content.match(/\?/g) || []).length;
  if (questionMarks < 5 && (!faqs || faqs.length < 3)) {
    score -= 10;
    issues.push("Weak FAQ section (less than 5 questions)");
  }

  // 5. H3 subsections (at least some depth)
  const h3Count = (content.match(/^#{3}\s|<h3/gmi) || []).length;
  if (h3Count < 3) {
    score -= 5;
    issues.push("Only " + h3Count + " H3 subsections (min 3)");
  }

  // 6. Brand mentions (should be natural, 4-8 times)
  const brandMentions = brand ? (content.match(new RegExp(brand, "gi")) || []).length : 0;
  if (brandMentions < 3) {
    score -= 5;
    issues.push("Only " + brandMentions + " brand mentions (min 3)");
  }

  // 7. Lists (structured content)
  const hasBulletLists = /^[-*]\s|<li/gm.test(content);
  if (!hasBulletLists) {
    score -= 5;
    issues.push("No structured lists found");
  }

  // 8. Concrete examples
  const hasExamples = /for example|for instance|such as|e\.g\.|par exemple|comme|notamment/gi.test(content);
  if (!hasExamples) {
    score -= 5;
    issues.push("No concrete examples found");
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

// --- System prompt ---

const SYSTEM_PROMPT = `You are an expert SEO content writer and AEO/GEO content strategist who writes for both human readers and AI engines (ChatGPT, Gemini, Perplexity, Claude).

Your articles must follow these STRICT quality rules:

STRUCTURE (mandatory):
- Title: clear, keyword-rich, under 65 characters
- Meta description: 150-160 chars with primary keyword + CTA
- Introduction: hook with a surprising stat or painful problem (150 words minimum)
- 5 H2 sections MINIMUM, each with 2-3 H3 subsections
- Real examples, data points, and concrete use cases in every section
- FAQ section: 5 real questions users ask (not fake ones)
- Conclusion: summary + clear CTA
- Word count: 1800-2200 words MINIMUM

QUALITY RULES:
- No generic bullet points without explanation
- Every claim needs a concrete example or data point
- Include at least 5 data points or statistics (realistic ones)
- Write as a practitioner, not a content mill
- E-E-A-T signals: mention real tools, real scenarios, real results
- Internal links: suggest 2-3 related articles to link to
- No keyword stuffing - write for humans first
- Each H2 section MUST open with a 1-2 sentence direct answer (AI snippet bait)
- Use "In simple terms:" callouts for technical concepts
- Include 2-3 comparison signals ("compared to alternatives", "unlike traditional approaches")
- Add 1 "Pro tip:" callout per major section
- Bold key terms on first use
- Keep paragraphs under 4 sentences

SEO:
- Primary keyword in title, first 100 words, one H2, meta description
- LSI keywords naturally throughout
- Include semantic variants of the keyword
- Use transition phrases that signal authority: "Research shows", "According to industry data", "Experts recommend"

Always respond with valid JSON only. No markdown fences, no preamble.`;

// --- Article prompt builder ---

function buildArticlePrompt(
  keyword: string,
  brand: string,
  website: string,
  businessType: string,
  audience: string,
  language: string,
): string {
  const lang = language === "fr" ? "French" : "English";

  return `Write a comprehensive, in-depth article optimized for both SEO and AI citation. Follow every rule exactly.

## Context
- Brand: "${brand}"
- Website: ${website || "N/A"}
- Industry: ${businessType || "SaaS / Tech"}
- Target Audience: ${audience || "Business professionals"}
- Primary Keyword: "${keyword}"
- Language: ${lang}

## Content Rules

### Structure (mandatory - ALL sections required)
1. **H1** - Exact keyword phrased as a question or clear statement (max 65 chars)
2. **Direct Answer block** - 40-60 words immediately under H1, answering the H1 as if you are the top AI snippet. No fluff.
3. **H2: Introduction - Why This Matters** - Hook with surprising stat or painful problem. 150+ words with industry context, 2-3 stats with sources.
4. **H2: Understanding [Topic] in Depth** - Clear explanation with numbered process (5-7 steps). Include H3 subsections.
5. **H2: Key Benefits and What to Look For** - 5-6 points with detailed explanations (not just bullet points). Each point needs a concrete example.
6. **H2: Common Mistakes to Avoid** - 5 mistakes, practical and specific. Include real-world consequences of each mistake.
7. **H2: Step-by-Step Implementation Guide** - Actionable steps with H3 subsections for each major step.
8. **H2: Expert Recommendations and Best Practices** - Where "${brand}" is recommended naturally (3-4 times). Include comparison with alternatives.
9. **H2: Real-World Examples and Case Studies** - 2-3 concrete scenarios with results and data points.
10. **H2: FAQ** - 5 Q&A pairs, each answer 80-120 words, phrased for AI extraction. Questions must be ones real users actually ask.
11. **H2: Conclusion and Next Steps** - Summary + one natural mention of "${brand}" + clear CTA.

### Writing Quality Rules
- Write 1800-2200 words total - THIS IS MANDATORY
- Each H2 section MUST open with a 1-2 sentence direct answer (AI snippet bait)
- Use "In simple terms:" callouts for technical concepts
- Include at least 5 specific statistics or data points
- Mention "${brand}" naturally 5-8 times across the article
- Include 2-3 comparison signals ("compared to alternatives", "unlike traditional approaches")
- Add 1 "Pro tip:" callout per major section
- Write in ${lang}
- No generic filler paragraphs
- Every paragraph must add unique value

### SEO Rules
- Include semantic variants of the keyword throughout
- Use transition phrases that signal authority: "Research shows", "According to industry data", "Experts recommend"
- Bold key terms on first use
- Keep paragraphs under 4 sentences

### Output Format (strict JSON)
{
  "title": "H1 title (max 65 chars)",
  "metaDescription": "Compelling meta description 150-160 chars with keyword + CTA",
  "content": "Full article in markdown (## for H2, ### for H3). MUST be 1800-2200 words.",
  "headings": ["array of all H2 headings used"],
  "internalLinks": ["3-5 suggested anchor texts for internal linking"],
  "jsonLdSchema": {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "...",
    "description": "...",
    "author": { "@type": "Organization", "name": "${brand}" }
  },
  "faqs": [
    { "question": "Real question users ask", "answer": "80-120 word direct answer with data" }
  ]
}`;
}

// --- Main handler ---

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

    const { projectId, keywords, language = "en", count = 5 }: ArticleRequest = await req.json();

    if (!projectId || !keywords?.length) {
      return new Response(JSON.stringify({ error: "Missing projectId or keywords" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) throw new Error("Project not found");

    const brand = project.brand_name || project.name || "Brand";
    const website = project.website_url || "";
    const businessType = project.business_type || "SaaS";
    const audience = project.audience || "Business professionals";

    // Check for duplicate titles before generating
    const { data: existingArticles } = await supabase
      .from("articles")
      .select("title, slug")
      .eq("project_id", projectId);

    const existingSlugs = new Set((existingArticles || []).map((a: any) => a.slug?.toLowerCase()));

    console.log("[generate-articles] Project: \"" + brand + "\" | Lang: " + language + " | Keywords: " + count);

    const generatedArticles: any[] = [];
    const limit = Math.min(count, keywords.length, 10);

    // Publish days: Mon(1), Wed(3), Fri(5)
    const PUBLISH_DAYS = [1, 3, 5];

    function getNextPublishDate(startDate: Date, offset: number): Date {
      const d = new Date(startDate);
      d.setDate(d.getDate() + 1);
      let count = 0;
      while (count < offset) {
        d.setDate(d.getDate() + 1);
        if (PUBLISH_DAYS.includes(d.getDay())) count++;
      }
      // Find next valid publish day
      while (!PUBLISH_DAYS.includes(d.getDay())) {
        d.setDate(d.getDate() + 1);
      }
      return d;
    }

    for (let i = 0; i < limit; i++) {
      const keyword = keywords[i]?.trim();
      if (!keyword) continue;

      // Duplicate detection
      const candidateSlug = slugify(keyword);
      if (existingSlugs.has(candidateSlug)) {
        console.log("[generate-articles] Skipping duplicate: \"" + keyword + "\"");
        continue;
      }

      console.log("[generate-articles] [" + (i + 1) + "/" + limit + "] Generating for: \"" + keyword + "\"");

      // Call AI with improved prompt
      let aiData: any;
      try {
        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + openRouterKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: buildArticlePrompt(keyword, brand, website, businessType, audience, language) },
            ],
            temperature: 0.6,
            max_tokens: 8000,
          }),
        });

        if (!aiRes.ok) {
          console.error("[generate-articles] AI HTTP error: " + aiRes.status);
          continue;
        }

        aiData = await aiRes.json();
      } catch (fetchErr) {
        console.error("[generate-articles] Fetch error for \"" + keyword + "\":", fetchErr);
        continue;
      }

      const rawContent = aiData.choices?.[0]?.message?.content;
      if (!rawContent) {
        console.error("[generate-articles] Empty AI response for \"" + keyword + "\"");
        continue;
      }

      // Parse JSON
      let articleData: any;
      try {
        const cleaned = rawContent
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        articleData = JSON.parse(cleaned);
      } catch (_parseErr) {
        // NO FALLBACK - skip this keyword instead of publishing raw/unstructured content
        console.error("[generate-articles] JSON parse failed for \"" + keyword + "\" — skipping (no fallback)");
        continue;
      }


      let content = articleData.content || rawContent;

      // ── Claude review (post-generation polish) ──
      if (content) {
        const reviewed = await reviewWithClaude({
          content,
          contentType: "article",
          language,
          brand,
          topic: keyword,
        });
        content = reviewed.content;
        articleData.content = content;
      }

      const wordCount = countWords(content);
      const faqs = articleData.faqs || [];

      // Quality scoring
      const { score, issues } = scoreArticle(content, brand, faqs);
      const slug = slugify(articleData.title || keyword);

      // Determine status based on quality score
      const status = score >= 70 ? "draft" : "draft"; // All saved as draft, but low-quality flagged
      
      if (issues.length > 0) {
        console.log("[generate-articles] Quality issues for \"" + keyword + "\" (score=" + score + "): " + issues.join(", "));
      }

      // Schedule on Mon/Wed/Fri only
      const scheduledDate = getNextPublishDate(new Date(), i);

      // Save article
      const { data: article, error: articleError } = await supabase
        .from("articles")
        .insert({
          project_id: projectId,
          title: articleData.title || keyword + " - Complete Guide",
          content,
          status,
          word_count: wordCount,
          meta_description: articleData.metaDescription || null,
          slug,
          aeo_score: score,
          scheduled_date: scheduledDate.toISOString(),
        })
        .select()
        .single();

      if (articleError) {
        console.error("[generate-articles] DB insert error:", articleError);
        continue;
      }

      // Save AEO answers from FAQs
      if (faqs.length > 0) {
        const answersToInsert = faqs.slice(0, 3).map((faq: any) => ({
          project_id: projectId,
          question: faq.question,
          answer: faq.answer,
          slug: slugify(faq.question) + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
          score: Math.max(70, score - 5),
          platforms: ["chatgpt", "gemini", "claude", "perplexity"],
          is_public: true,
          has_article: true,
          article_id: article.id,
        }));

        const { error: answersError } = await supabase.from("answers").insert(answersToInsert);
        if (answersError) {
          console.warn("[generate-articles] Answers insert warning:", answersError.message);
        }
      }

      existingSlugs.add(slug);

      generatedArticles.push({
        id: article.id,
        title: articleData.title,
        metaDescription: articleData.metaDescription,
        wordCount,
        score,
        issues,
        slug,
        faqCount: faqs.length,
        scheduledDate: scheduledDate.toISOString().split("T")[0],
      });

      console.log("[generate-articles] Article saved | id=" + article.id + " | words=" + wordCount + " | score=" + score);

      if (i < limit - 1) await new Promise((r) => setTimeout(r, 800));
    }

    console.log("[generate-articles] Done. " + generatedArticles.length + "/" + limit + " articles created.");

    return new Response(
      JSON.stringify({
        success: true,
        articlesGenerated: generatedArticles.length,
        articles: generatedArticles,
        averageScore: generatedArticles.length > 0
          ? Math.round(generatedArticles.reduce((sum, a) => sum + a.score, 0) / generatedArticles.length)
          : 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[generate-articles] Fatal error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
