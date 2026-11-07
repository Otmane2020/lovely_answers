import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reviewWithClaude } from "../_shared/claude-review.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IntentType = "price" | "duration" | "criteria" | "comparison" | "howto" | "best" | "what" | "why";
const INTENTS: IntentType[] = ["price", "criteria", "comparison", "howto", "best", "what", "why", "duration"];

function detectIntent(text: string): IntentType {
  const q = text.toLowerCase();
  if (/prix|tarif|cost|price|budget/.test(q)) return "price";
  if (/combien de temps|duration|how long|d\u00e9lai/.test(q)) return "duration";
  if (/crit[e\u00e8]re|condition|requirement|choisir/.test(q)) return "criteria";
  if (/vs|versus|compar|diff\u00e9rence/.test(q)) return "comparison";
  if (/comment|how to|utiliser|\u00e9viter/.test(q)) return "howto";
  if (/meilleur|best/.test(q)) return "best";
  if (/pourquoi|why/.test(q)) return "why";
  return "what";
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeScore(answer: string, brand: string): number {
  let score = 65;
  const currentYear = new Date().getFullYear();
  if (answer.includes(String(currentYear)) || answer.includes(String(currentYear + 1))) score += 10;
  if (/\d+\s*(\u20ac|\$|%|euros?|mois|jours?)/i.test(answer)) score += 8;
  if (/crit[e\u00e8]re|choisir|\u00e9viter|erreur|condition/i.test(answer)) score += 8;
  if (/[:\-\u2022]|\d\.\s/.test(answer)) score += 5;
  if (new RegExp(escapeRegex(brand), "i").test(answer)) score += 4;
  return Math.min(98, Math.max(50, score));
}

function ensureQuestionMark(text: string): string {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return trimmed;
  return trimmed.replace(/[.!,;:]$/, "") + " ?";
}

async function generateQuestion(
  brandName: string,
  description: string,
  language: string,
  apiKey: string,
  dayNumber: number,
  keywords: string[] = []
): Promise<{ question: string; intent: IntentType }> {
  const currentYear = new Date().getFullYear();

  const keywordsInstruction = keywords.length > 0
    ? language === "fr"
      ? "\nMots-cles SEO du projet a UTILISER comme base pour la question:\n" + keywords.join(", ") + "\n\nTransforme l'un de ces mots-cles en question naturelle et decisionnelle."
      : "\nProject SEO keywords to USE as the basis for the question:\n" + keywords.join(", ") + "\n\nTransform one of these keywords into a natural, decision-oriented question."
    : "";

  const systemPrompt = language === "fr"
    ? "Tu generes UNE question DECISIONNELLE unique. La question DOIT finir par \"?\". INTERDIT de generer des mots-cles simples."
    : "Generate ONE unique DECISION-ORIENTED question. The question MUST end with \"?\". FORBIDDEN to generate simple keywords.";

  const userPrompt = "Business: " + brandName + "\nDescription: " + description + "\nDay number: " + dayNumber + keywordsInstruction + "\n\nGenerate 1 unique COMPLETE QUESTION. Return JSON: {\"question\": \"...\", \"intent\": \"criteria|price|howto|comparison|why|best\"}";

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Invalid JSON");

    const parsed = JSON.parse(match[0]);
    return {
      question: ensureQuestionMark(parsed.question),
      intent: INTENTS.includes(parsed.intent) ? parsed.intent : detectIntent(parsed.question),
    };
  } catch (e) {
    console.error("Failed to generate question:", e);
    return {
      question: language === "fr"
        ? "Comment choisir " + brandName.toLowerCase() + " adapte a ses besoins en " + currentYear + " ?"
        : "How to choose " + brandName.toLowerCase() + " suited to your needs in " + currentYear + "?",
      intent: "criteria",
    };
  }
}

async function generateAnswer(
  question: string,
  brandName: string,
  description: string,
  intent: IntentType,
  language: string,
  apiKey: string
): Promise<{ answer: string; bullets: string[]; faq: { q: string; a: string }[] }> {
  const systemPrompt = language === "fr"
    ? "Tu es un expert AEO. Redige une reponse citation-first. Premiere phrase = reponse DIRECTE. Mention " + brandName + " UNE fois. 80-120 mots."
    : "You are an AEO expert. Write a citation-first answer. First sentence = DIRECT answer. Mention " + brandName + " ONCE. 80-120 words.";

  const userPrompt = "Question: " + question + "\nBrand: " + brandName + "\nDescription: " + description + "\nIntent: " + intent + "\n\nReturn JSON: {\"answer\": \"...\", \"bullets\": [], \"faq\": []}";

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Invalid JSON");
    return JSON.parse(match[0]);
  } catch (e) {
    console.error("Failed to generate answer:", e);
    return {
      answer: brandName + " propose des solutions adaptees. Consultez les ressources disponibles.",
      bullets: [],
      faq: [],
    };
  }
}

async function generateArticle(
  question: string,
  answer: string,
  brandName: string,
  language: string,
  apiKey: string
): Promise<{ title: string; content: string; htmlContent: string; metaDescription: string; wordCount: number }> {
  const systemPrompt = language === "fr"
    ? "Tu rediges un article de blog SEO/AEO complet. Titre accrocheur. 800-1200 mots. Mentionner " + brandName + " 2-3 fois."
    : "Write a complete SEO/AEO blog article. Catchy title. 800-1200 words. Mention " + brandName + " 2-3 times.";

  const userPrompt = "Question: " + question + "\nAnswer: " + answer + "\nBrand: " + brandName + "\n\nReturn JSON: {\"title\": \"...\", \"content\": \"...\", \"metaDescription\": \"...\"}";

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        temperature: 0.5,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";

    let jsonStr = "";
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
    else {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) jsonStr = match[0];
    }

    if (!jsonStr) throw new Error("Invalid JSON");

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, " ");
      jsonStr = jsonStr.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      parsed = JSON.parse(jsonStr);
    }

    const articleContent = parsed.content || answer;
    const wordCount = articleContent.split(/\s+/).length;

    const htmlContent = articleContent
      .replace(/### (.*)/g, "<h3>$1</h3>")
      .replace(/## (.*)/g, "<h2>$1</h2>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/^/, "<p>")
      .replace(/$/, "</p>");

    return {
      title: parsed.title || question,
      content: articleContent,
      htmlContent,
      metaDescription: parsed.metaDescription || answer.substring(0, 155),
      wordCount,
    };
  } catch (e) {
    console.error("Failed to generate article:", e);
    return {
      title: question,
      content: answer,
      htmlContent: "<p>" + answer + "</p>",
      metaDescription: answer.substring(0, 155),
      wordCount: answer.split(/\s+/).length,
    };
  }
}

/**
 * CRON JOB: Daily Planning Fill
 * Runs daily at 6 AM UTC
 * For each active project:
 * 1. Check the next 30 days in the planning table
 * 2. For each day missing content, generate 1 answer + 1 article
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const {
      projectId,
      days = 31,
      maxDaysToFill = 3,
    } = body ?? {};

    // Publish-day set is computed per project below (honors project_settings.publish_frequency).
    const getPublishDaysSet = (frequency: string): Set<number> => {
      switch (frequency) {
        case "daily":   return new Set([0, 1, 2, 3, 4, 5, 6]);
        case "weekly":  return new Set([1]);
        case "2x_week": return new Set([2, 4]);
        case "monthly": return new Set();           // unused — branch short-circuits on getDate()===1
        case "3x_week":
        default:        return new Set([1, 3, 5]);
      }
    };

    console.log("[daily-planning-fill] Starting daily planning fill...", {
      projectId,
      days,
      maxDaysToFill,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const projectsQuery = supabase
      .from("projects")
      .select("id, name, language, brand_name, business_description")
      .eq("is_active", true);

    const { data: projects, error: projectsError } = projectId
      ? await projectsQuery.eq("id", projectId)
      : await projectsQuery;

    if (projectsError) throw projectsError;

    console.log("[daily-planning-fill] Found " + (projects?.length || 0) + " active projects");

    const results: {
      projectId: string;
      name: string;
      daysTouched: number;
      daysCompleted: number;
      stoppedEarly: boolean;
    }[] = [];

    for (const project of projects || []) {
      const brandName = project.brand_name || project.name;
      const description = project.business_description || "";
      const language = project.language || "fr";

      // Load per-project publish frequency
      const { data: psRow } = await supabase
        .from("project_settings")
        .select("publish_frequency")
        .eq("project_id", project.id)
        .maybeSingle();
      const publishFrequency: string = (psRow as any)?.publish_frequency || "3x_week";
      const PUBLISH_DAYS = getPublishDaysSet(publishFrequency);
      console.log(`[daily-planning-fill] Project ${project.name} frequency=${publishFrequency}`);

      const { data: projectKeywords } = await supabase
        .from("keywords")
        .select("keyword")
        .eq("project_id", project.id)
        .eq("is_used", false)
        .limit(30);

      const keywordList = (projectKeywords || []).map((k: any) => k.keyword);
      console.log("[daily-planning-fill] Found " + keywordList.length + " unused keywords for project " + project.name);

      let daysTouched = 0;
      let daysCompleted = 0;
      let stoppedEarly = false;

      // Ensure rows exist in planning for the whole window (31 days)
      for (let dayOffset = 0; dayOffset < days; dayOffset++) {
        const targetDate = new Date(today.getTime() + dayOffset * 86400000);
        const dateStr = targetDate.toISOString().split("T")[0];

        // Respect project's publish_frequency
        const dayOfWeek = targetDate.getDay();
        if (publishFrequency === "monthly") {
          if (targetDate.getDate() !== 1) continue;
        } else if (!PUBLISH_DAYS.has(dayOfWeek)) {
          continue;
        }

        await supabase
          .from("planning")
          .upsert(
            { project_id: project.id, day: dateStr },
            { onConflict: "project_id,day", ignoreDuplicates: true }
          );

        const { data: planningRow } = await supabase
          .from("planning")
          .select("id, answer_id, article_id")
          .eq("project_id", project.id)
          .eq("day", dateStr)
          .single();

        if (!planningRow) continue;

        // If already complete, skip
        if (planningRow.answer_id && planningRow.article_id) continue;

        // Stop early to avoid timeout
        if (daysTouched >= maxDaysToFill) {
          stoppedEarly = true;
          break;
        }

        daysTouched++;

        console.log("[daily-planning-fill] Filling day " + dateStr + " for " + project.name + "...");

        // 1) Ensure we have an answer
        let answerId = planningRow.answer_id as string | null;
        let answerQuestion = "";
        let answerText = "";

        if (answerId) {
          const { data: existingAnswer } = await supabase
            .from("answers")
            .select("id, question, answer")
            .eq("id", answerId)
            .single();
          if (existingAnswer) {
            answerQuestion = existingAnswer.question;
            answerText = existingAnswer.answer;
          } else {
            answerId = null;
          }
        }

        if (!answerId) {
          const q = await generateQuestion(brandName, description, language, apiKey, dayOffset, keywordList);
          const answerData = await generateAnswer(q.question, brandName, description, q.intent, language, apiKey);

          // ── Claude review (post-generation polish) ──
          if (answerData.answer) {
            const reviewed = await reviewWithClaude({
              content: answerData.answer,
              contentType: "aeo_answer",
              language,
              brand: brandName,
              question: q.question,
            });
            answerData.answer = reviewed.content;
          }

          const score = computeScore(answerData.answer, brandName);

          const { data: insertedAnswer, error: answerError } = await supabase
            .from("answers")
            .insert({
              project_id: project.id,
              question: q.question,
              answer: answerData.answer,
              slug: generateSlug(q.question),
              intent: q.intent,
              score,
              is_public: false,
              scheduled_date: targetDate.toISOString(),
              supporting_content: { bullets: answerData.bullets, faq: answerData.faq },
            })
            .select()
            .single();

          if (answerError || !insertedAnswer) {
            console.error("[daily-planning-fill] Error inserting answer:", answerError);
            continue;
          }

          answerId = insertedAnswer.id;
          answerQuestion = insertedAnswer.question;
          answerText = insertedAnswer.answer;

          await supabase
            .from("planning")
            .update({ answer_id: answerId })
            .eq("id", planningRow.id);
        }

        // 2) Ensure we have an article
        if (!planningRow.article_id) {
          try {
            const articleData = await generateArticle(answerQuestion, answerText, brandName, language, apiKey);

            // ── Claude review ──
            if (articleData.htmlContent) {
              const reviewed = await reviewWithClaude({
                content: articleData.htmlContent,
                contentType: "article",
                language,
                brand: brandName,
                topic: answerQuestion,
              });
              articleData.htmlContent = reviewed.content;
              articleData.content = reviewed.content;
            }

            const score = computeScore(answerText, brandName);

            const { data: insertedArticle, error: articleError } = await supabase
              .from("articles")
              .insert({
                project_id: project.id,
                linked_answer_id: answerId,
                title: articleData.title,
                content: articleData.content,
                html_content: articleData.htmlContent,
                meta_description: articleData.metaDescription,
                word_count: articleData.wordCount,
                slug: generateSlug(articleData.title),
                status: "scheduled",
                scheduled_date: targetDate.toISOString(),
                aeo_score: score,
              })
              .select()
              .single();

            if (articleError || !insertedArticle) {
              console.error("[daily-planning-fill] Error inserting article:", articleError);
              continue;
            }

            await supabase
              .from("answers")
              .update({ article_id: insertedArticle.id, has_article: true })
              .eq("id", answerId);

            await supabase
              .from("planning")
              .update({ article_id: insertedArticle.id })
              .eq("id", planningRow.id);

            daysCompleted++;
          } catch (err) {
            console.error("[daily-planning-fill] Error generating article for " + dateStr + ":", err);
          }
        }

        // Small delay
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      results.push({ projectId: project.id, name: project.name, daysTouched, daysCompleted, stoppedEarly });
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[daily-planning-fill] Error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
