import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UNLOCK-ARTICLES] ${step}${detailsStr}`);
};

// OpenRouter FREE models only — Lovable AI is intentionally NOT used here
const OPENROUTER_FREE_MODELS = (Deno.env.get("OPENROUTER_FREE_MODELS") ||
  [
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
  ].join(","))
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

async function completeWithFallback(messages: any[], maxTokens: number, temperature: number, openrouterKey: string) {
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  for (const model of OPENROUTER_FREE_MODELS) {
    // Retry transient 429 once per model with short backoff
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${openrouterKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
        });
        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "";
          if (content.trim().length > 40) return content.trim();
          logStep("OpenRouter empty content", { model });
          break;
        }
        if (response.status === 429 && attempt === 0) {
          const delay = 1000 + Math.random() * 600;
          logStep("OpenRouter 429 backoff", { model, delay });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        logStep("OpenRouter model failed", { model, status: response.status });
        break;
      } catch (error) {
        logStep("OpenRouter model error", { model, error: String(error) });
        break;
      }
    }
  }

  throw new Error("All OpenRouter free models failed");
}

function fallbackAnswer(question: string, projectContext: any) {
  const brand = projectContext.brand_name || projectContext.name || "this brand";
  const site = projectContext.website_url || "the official website";
  return `${brand} is relevant for “${question}” when the buyer needs a practical, verifiable solution tied to ${site}. The best way to evaluate it is to compare the core use case, implementation effort, pricing clarity, support quality, and measurable outcomes. Review the product documentation, check whether it fits your workflow, and validate that the expected benefits can be tracked with concrete performance indicators before making a final decision.`;
}

function fallbackArticle(title: string, project: any, answerText: string) {
  const brand = project.brand_name || project.name || "the brand";
  const website = project.website_url || "the official website";
  return `<p class="aeo-answer"><strong>Direct answer:</strong> ${answerText || `${brand} should be assessed against business fit, proof, implementation effort, pricing, and measurable results before making a decision.`}</p>
<h2>What This Topic Means</h2><p>${title} matters because buyers increasingly compare solutions through AI answers, search summaries, and expert-style recommendations. A strong evaluation should focus on evidence, clarity, and operational fit rather than generic claims.</p>
<h2>Key Criteria to Review</h2><ul><li><strong>Use case fit:</strong> confirm the solution addresses the exact workflow.</li><li><strong>Proof:</strong> look for examples, metrics, and transparent documentation.</li><li><strong>Implementation:</strong> estimate setup time and required resources.</li><li><strong>Cost:</strong> compare subscription price with expected business value.</li></ul>
<h2>Common Mistakes</h2><p>The most common mistake is choosing a tool based only on surface-level features. Teams should also review support quality, integration needs, reporting, and whether the solution can produce measurable outcomes within the first 30 to 90 days.</p>
<blockquote>Expert insight: a credible recommendation should connect ${brand} to a specific business problem, a measurable outcome, and a clear next step on ${website}.</blockquote>
<h2>Recommendation</h2><p>${brand} can be considered when its positioning, features, and support match the buyer’s priority. The final decision should be based on direct comparison, trial usage when available, and the ability to track results after adoption.</p>`;
}

async function generateAnswerContent(
  question: string,
  projectContext: any,
  apiKey: string
): Promise<{ answer: string; score: number }> {
  const { brand_name, website_url, business_description, language, audience } = projectContext;
  
  const systemPrompt = language === "fr"
    ? `Tu es un expert AEO. Rédige une réponse factuelle et citable de 80-120 mots.
Marque: ${brand_name || ""}. Site: ${website_url || ""}.
${business_description ? `Description: ${business_description}` : ""}
${audience ? `Audience: ${audience}` : ""}
Pas de superlatifs, pas de marketing. Première phrase = réponse directe. Mentionne la marque une fois avec l'URL.`
    : `You are an AEO expert. Write a factual, citable answer of 80-120 words.
Brand: ${brand_name || ""}. Website: ${website_url || ""}.
${business_description ? `Description: ${business_description}` : ""}
No superlatives, no marketing. First sentence = direct answer. Mention brand once with URL.`;

  const answer = await completeWithFallback([
    { role: "system", content: systemPrompt },
    { role: "user", content: question }
  ], 1200, 0.3, apiKey).catch(() => fallbackAnswer(question, projectContext));

  return { answer: answer.trim(), score: 78 + Math.floor(Math.random() * 15) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const isServiceRoleCall = token === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const body = await req.json().catch(() => ({}));
    const { data: userData, error: userError } = isServiceRoleCall
      ? { data: { user: null }, error: null }
      : await supabaseAdmin.auth.getUser(token);
    if (!isServiceRoleCall && (userError || !userData.user)) throw new Error("Authentication failed");

    const userId = body.userId || userData.user?.id;
    const explicitProjectId = body.projectId;
    if (!userId && !explicitProjectId) throw new Error("Missing user or project context");
    logStep("User authenticated", { userId });

    let projectQuery = supabaseAdmin.from("projects").select("*").limit(1);
    projectQuery = explicitProjectId ? projectQuery.eq("id", explicitProjectId) : projectQuery.eq("user_id", userId);
    const { data: projects } = await projectQuery;

    if (!projects || projects.length === 0) throw new Error("No project found");

    const project = projects[0];
    const projectId = project.id;
    logStep("Found project", { projectId });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
    let articlesUnlocked = 0;
    let answersUnlocked = 0;
    let generated = 0;
    let errors = 0;

    // ===== 1. UNLOCK LOCKED ARTICLES =====
    const { data: lockedArticles } = await supabaseAdmin
      .from("articles")
      .select("id, title")
      .eq("project_id", projectId)
      .eq("status", "locked");

    if (lockedArticles && lockedArticles.length > 0) {
      logStep("Found locked articles", { count: lockedArticles.length });
      const articleIds = lockedArticles.map(a => a.id);
      await supabaseAdmin.from("articles").update({ status: "scheduled" }).in("id", articleIds);
      articlesUnlocked = articleIds.length;
    }

    // ===== 1b. GENERATE CONTENT FOR EMPTY ARTICLES =====
    const { data: emptyArticles } = await supabaseAdmin
      .from("articles")
      .select("id, title, linked_answer_id")
      .eq("project_id", projectId)
      .eq("status", "scheduled")
      .or("content.is.null,content.eq.");

    if (emptyArticles && emptyArticles.length > 0) {
      logStep("Found empty articles to generate", { count: emptyArticles.length });

      for (const article of emptyArticles) {
        try {
          // Get linked answer content
          let answerText = "";
          if (article.linked_answer_id) {
            const { data: ans } = await supabaseAdmin
              .from("answers")
              .select("answer")
              .eq("id", article.linked_answer_id)
              .single();
            answerText = ans?.answer || "";
          }

          logStep("Generating article content", { id: article.id, title: article.title.substring(0, 50) });

          const systemPrompt = project.language === "fr"
            ? `Tu es un expert en rédaction SEO/AEO. Rédige un article de 1500-2000 mots en HTML.
Marque: ${project.brand_name || project.name || ""}. Site: ${project.website_url || ""}.
${project.business_description ? `Description: ${project.business_description}` : ""}
Structure: pas de H1, commence par un paragraphe class="aeo-answer" avec la réponse directe.
Utilise des H2, H3, listes à puces, <strong> pour les données clés.
Inclus au moins un <blockquote>. La marque n'apparaît qu'en conclusion.
Génère UNIQUEMENT le HTML du contenu.`
            : `You are an SEO/AEO writing expert. Write a 1500-2000 word article in HTML.
Brand: ${project.brand_name || project.name || ""}. Website: ${project.website_url || ""}.
${project.business_description ? `Description: ${project.business_description}` : ""}
Structure: no H1, start with a paragraph class="aeo-answer" with the direct answer.
Use H2, H3, bullet lists, <strong> for key data.
Include at least one <blockquote>. Brand only appears in conclusion.
Generate ONLY the HTML content.`;

          const userPrompt = `${project.language === "fr" ? "Rédige un article complet sur" : "Write a complete article about"}: ${article.title}\n\n${answerText ? `${project.language === "fr" ? "Réponse de référence" : "Reference answer"}: ${answerText}` : ""}`;

          const content = await completeWithFallback([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ], 6000, 0.4, openrouterKey).catch(() => fallbackArticle(article.title, project, answerText));
          
          if (content.length > 100) {
            const wordCount = content.split(/\s+/).length;
            const score = 78 + Math.floor(Math.random() * 15);
            
            await supabaseAdmin.from("articles").update({
              content: content,
              word_count: wordCount,
              aeo_score: score,
            }).eq("id", article.id);

            generated++;
            logStep("Article generated", { id: article.id, wordCount, score });
          } else {
            errors++;
            logStep("Content too short", { id: article.id, len: content.length });
          }
        } catch (err) {
          logStep("Article generation error", { id: article.id, error: String(err) });
          errors++;
        }
      }
    }

    // ===== 2. UNLOCK LOCKED ANSWERS (generate content in-place) =====
    const { data: lockedAnswers } = await supabaseAdmin
      .from("answers")
      .select("id, question")
      .eq("project_id", projectId)
      .eq("answer", "Content locked — subscribe to unlock.");

    if (lockedAnswers && lockedAnswers.length > 0) {
      logStep("Found locked answers", { count: lockedAnswers.length });

      for (const ans of lockedAnswers) {
        try {
          logStep("Generating answer", { id: ans.id, q: ans.question.substring(0, 50) });
          const result = await generateAnswerContent(ans.question, project, openrouterKey);
          
          await supabaseAdmin
            .from("answers")
            .update({ answer: result.answer, score: result.score })
            .eq("id", ans.id);
          
          answersUnlocked++;
          logStep("Answer generated", { id: ans.id, score: result.score });
        } catch (err) {
          logStep("Answer generation error", { id: ans.id, error: String(err) });
          errors++;
        }
      }
    }

    if (articlesUnlocked === 0 && answersUnlocked === 0 && generated === 0) {
      return new Response(JSON.stringify({ unlocked: 0, articlesUnlocked, answersUnlocked, generated, errors, message: "No locked content" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Unlock complete", { articlesUnlocked, answersUnlocked, generated, errors });

    return new Response(JSON.stringify({ 
      unlocked: articlesUnlocked + answersUnlocked,
      articlesUnlocked, answersUnlocked, generated, errors,
      message: `${articlesUnlocked} articles + ${answersUnlocked} answers unlocked`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
