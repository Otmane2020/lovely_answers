import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IntentType = "price" | "duration" | "criteria" | "comparison" | "howto" | "best" | "what" | "why";
const INTENTS: IntentType[] = ["price", "criteria", "comparison", "howto", "best", "what", "why", "duration"];

function detectIntent(text: string): IntentType {
  const q = text.toLowerCase();
  if (/prix|tarif|cost|price|budget/.test(q)) return "price";
  if (/combien de temps|duration|how long|délai/.test(q)) return "duration";
  if (/crit[eè]re|condition|requirement|choisir/.test(q)) return "criteria";
  if (/vs|versus|compar|différence/.test(q)) return "comparison";
  if (/comment|how to|utiliser|éviter/.test(q)) return "howto";
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
  if (/\d+\s*(€|\$|%|euros?|mois|jours?)/i.test(answer)) score += 8;
  else if (/\d+/.test(answer)) score += 3;
  if (/crit[eè]re|choisir|éviter|erreur|condition/i.test(answer)) score += 8;
  if (/[:\-•]|\d\.\s/.test(answer)) score += 5;
  const wordCount = answer.split(/\s+/).length;
  if (wordCount >= 80 && wordCount <= 120) score += 5;
  if (new RegExp(escapeRegex(brand), "i").test(answer)) score += 4;
  if (/^(un|une|le|la|les|l')\s+\w+\s+(est|sont|désigne)/i.test(answer)) score -= 10;
  return Math.min(98, Math.max(50, score));
}

function ensureQuestionMark(text: string): string {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return trimmed;
  return trimmed.replace(/[.!,;:]$/, "") + " ?";
}

async function generateQuestions(
  brandName: string,
  description: string,
  language: string,
  apiKey: string,
  count: number
): Promise<{ question: string; intent: IntentType }[]> {
  const currentYear = new Date().getFullYear();
  
  const systemPrompt = language === "fr"
    ? `Tu génères ${count} questions DÉCISIONNELLES uniques. CHAQUE question DOIT finir par "?". INTERDIT de générer des mots-clés simples.`
    : `Generate ${count} unique DECISION-ORIENTED questions. EVERY question MUST end with "?". FORBIDDEN to generate simple keywords.`;

  const userPrompt = `Business: ${brandName}\nDescription: ${description}\n\nGenerate ${count} unique COMPLETE QUESTIONS. Return JSON: {"questions": [{"question": "...", "intent": "criteria|price|howto|comparison|why|best"}]}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
    return parsed.questions.slice(0, count).map((q: any) => ({
      question: ensureQuestionMark(q.question),
      intent: INTENTS.includes(q.intent) ? q.intent : detectIntent(q.question),
    }));
  } catch (e) {
    console.error("Failed to generate questions:", e);
    const fallback: { question: string; intent: IntentType }[] = [];
    for (let i = 0; i < count; i++) {
      fallback.push({
        question: language === "fr" 
          ? `Comment choisir ${brandName.toLowerCase()} adapté à ses besoins (${i + 1}) ?`
          : `How to choose ${brandName.toLowerCase()} suited to your needs (${i + 1})?`,
        intent: INTENTS[i % INTENTS.length],
      });
    }
    return fallback;
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
  const currentYear = new Date().getFullYear();
  const systemPrompt = language === "fr"
    ? `Tu es un expert AEO. Rédige une réponse citation-first. Première phrase = réponse DIRECTE. Mention ${brandName} UNE fois. 80-120 mots.`
    : `You are an AEO expert. Write a citation-first answer. First sentence = DIRECT answer. Mention ${brandName} ONCE. 80-120 words.`;

  const userPrompt = `Question: ${question}\nBrand: ${brandName}\nDescription: ${description}\nIntent: ${intent}\n\nReturn JSON: {"answer": "...", "bullets": [], "faq": []}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
      answer: `${brandName} propose des solutions adaptées. Consultez les ressources disponibles.`,
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
  const currentYear = new Date().getFullYear();
  const systemPrompt = language === "fr"
    ? `Tu rédiges un article de blog SEO/AEO complet. Titre accrocheur. 800-1200 mots. Mentionner ${brandName} 2-3 fois.`
    : `Write a complete SEO/AEO blog article. Catchy title. 800-1200 words. Mention ${brandName} 2-3 times.`;

  const userPrompt = `Question: ${question}\nAnswer: ${answer}\nBrand: ${brandName}\n\nReturn JSON: {"title": "...", "content": "...", "metaDescription": "..."}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
    
    const parsed = JSON.parse(jsonStr);
    const articleContent = parsed.content || answer;
    const wordCount = articleContent.split(/\s+/).length;

    let htmlContent = articleContent
      .replace(/### (.*)/g, '<h3>$1</h3>')
      .replace(/## (.*)/g, '<h2>$1</h2>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');

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
      htmlContent: `<p>${answer}</p>`,
      metaDescription: answer.substring(0, 155),
      wordCount: answer.split(/\s+/).length,
    };
  }
}

/**
 * Cron Job: Check Planning Completeness
 * Runs every 6 hours to check if each project has 60 items (30 answers + 30 articles) for the next 30 days
 * If not, triggers auto-regeneration directly
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

    console.log("[check-planning] Starting planning completeness check...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today.getTime() + 30 * 86400000);

    // Get all active projects
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id, name, language, brand_name, business_description, user_id")
      .eq("is_active", true);

    if (projectsError) {
      console.error("[check-planning] Error fetching projects:", projectsError);
      throw projectsError;
    }

    console.log(`[check-planning] Found ${projects?.length || 0} active projects`);

    const results: { projectId: string; name: string; status: string; answersCount: number; articlesCount: number; gsoCount: number }[] = [];

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

    for (const project of projects || []) {
      // Resolve publish frequency for this project
      const { data: psRow } = await supabase
        .from("project_settings")
        .select("publish_frequency")
        .eq("project_id", project.id)
        .maybeSingle();
      const publishFrequency: string = (psRow as any)?.publish_frequency || "3x_week";
      const PUBLISH_DAYS = getPublishDaysSet(publishFrequency);

      // Build the list of publish dates in the next 30 days that match the frequency
      const publishDates: Date[] = [];
      for (let off = 0; off < 30; off++) {
        const d = new Date(today.getTime() + off * 86400000);
        if (publishFrequency === "monthly") {
          if (d.getDate() === 1) publishDates.push(d);
        } else if (PUBLISH_DAYS.has(d.getDay())) {
          publishDates.push(d);
        }
      }
      const expectedDays = publishDates.length;

      // Count answers in next 30 days
      const { count: answersCount } = await supabase
        .from("answers")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .gte("scheduled_date", today.toISOString())
        .lt("scheduled_date", endDate.toISOString());

      // Count articles in next 30 days
      const { count: articlesCount } = await supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .gte("scheduled_date", today.toISOString())
        .lt("scheduled_date", endDate.toISOString());

      // Count GSO contents in next 30 days
      const { count: gsoCount } = await supabase
        .from("geo_contents")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .gte("scheduled_date", today.toISOString())
        .lt("scheduled_date", endDate.toISOString());

      const totalAeo = (answersCount || 0) + (articlesCount || 0);
      const expectedAeo = expectedDays * 2; // 1 answer + 1 article per publish day
      const totalGso = gsoCount || 0;
      const expectedGso = expectedDays;

      console.log(`[check-planning] Project ${project.name} (freq=${publishFrequency}, days=${expectedDays}): ${answersCount} answers, ${articlesCount} articles, ${totalGso} GSO (AEO: ${totalAeo}/${expectedAeo}, GSO: ${totalGso}/${expectedGso})`);

      const brandName = project.brand_name || project.name;
      const description = project.business_description || "";
      const language = project.language || "fr";

      let aeoStatus = "complete";
      let gsoStatus = "complete";

      // === AEO Regeneration ===
      if (totalAeo < expectedAeo) {
        console.log(`[check-planning] Project ${project.name} AEO needs regeneration (${totalAeo}/${expectedAeo})`);
        try {
          // Delete existing scheduled AEO items
          await supabase
            .from("answers")
            .update({ article_id: null, has_article: false })
            .eq("project_id", project.id)
            .gte("scheduled_date", today.toISOString())
            .lt("scheduled_date", endDate.toISOString());
          
          await supabase
            .from("articles")
            .delete()
            .eq("project_id", project.id)
            .gte("scheduled_date", today.toISOString())
            .lt("scheduled_date", endDate.toISOString());
          
          await supabase
            .from("answers")
            .delete()
            .eq("project_id", project.id)
            .gte("scheduled_date", today.toISOString())
            .lt("scheduled_date", endDate.toISOString());

          const questions = await generateQuestions(brandName, description, language, apiKey, expectedDays);
          let answersCreated = 0;
          let articlesCreated = 0;

          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (i >= publishDates.length) break;
            const scheduledDate = publishDates[i];
            const scheduledDateStr = scheduledDate.toISOString();
            try {
              const answerData = await generateAnswer(q.question, brandName, description, q.intent, language, apiKey);
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
                  scheduled_date: scheduledDateStr,
                  supporting_content: { bullets: answerData.bullets, faq: answerData.faq },
                })
                .select()
                .single();
              if (answerError) { console.error(`Error inserting answer:`, answerError); continue; }
              answersCreated++;

              const articleData = await generateArticle(q.question, answerData.answer, brandName, language, apiKey);
              const { data: insertedArticle, error: articleError } = await supabase
                .from("articles")
                .insert({
                  project_id: project.id,
                  linked_answer_id: insertedAnswer.id,
                  title: articleData.title,
                  content: articleData.content,
                  html_content: articleData.htmlContent,
                  meta_description: articleData.metaDescription,
                  word_count: articleData.wordCount,
                  slug: generateSlug(articleData.title),
                  status: "scheduled",
                  scheduled_date: scheduledDateStr,
                  aeo_score: score,
                })
                .select()
                .single();
              if (articleError) { console.error(`Error inserting article:`, articleError); }
              else {
                articlesCreated++;
                await supabase.from("answers").update({ article_id: insertedArticle.id, has_article: true }).eq("id", insertedAnswer.id);
              }
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) { console.error(`Error processing AEO question ${i + 1}:`, err); }
          }
          console.log(`[check-planning] AEO regeneration for ${project.name}: ${answersCreated} answers, ${articlesCreated} articles`);
          aeoStatus = "regenerated";
        } catch (genError) {
          console.error(`[check-planning] AEO error for ${project.name}:`, genError);
          aeoStatus = "error";
        }
      }

      // === GSO Regeneration ===
      if (totalGso < expectedGso) {
        console.log(`[check-planning] Project ${project.name} GSO needs regeneration (${totalGso}/${expectedGso})`);
        try {
          // Call the existing generate-30-gso-contents function
          const gsoRes = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-30-gso-contents`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ projectId: project.id }),
            }
          );
          const gsoData = await gsoRes.json();
          console.log(`[check-planning] GSO regeneration for ${project.name}: ${gsoData?.created || 0} items`);
          gsoStatus = "regenerated";
        } catch (gsoErr) {
          console.error(`[check-planning] GSO error for ${project.name}:`, gsoErr);
          gsoStatus = "error";
        }
      }

      results.push({
        projectId: project.id,
        name: project.name,
        status: aeoStatus === "error" || gsoStatus === "error" ? "error" : (aeoStatus === "regenerated" || gsoStatus === "regenerated" ? "regenerated" : "complete"),
        answersCount: answersCount || 0,
        articlesCount: articlesCount || 0,
        gsoCount: totalGso,
      });
    }

    console.log("[check-planning] Completed. Results:", JSON.stringify(results));

    return new Response(
      JSON.stringify({
        success: true,
        checked: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[check-planning] Error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});