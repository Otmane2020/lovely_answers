import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { reviewWithClaude } from "../_shared/claude-review.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

/* =======================
   HELPERS
======================= */
function generateSlug(question: string): string {
  return (
    question
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 70) +
    "-" +
    Date.now().toString(36)
  );
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Score amélioré — récompense la richesse locale et la structure
 */
function computeLocalScore(answer: string, businessName: string): number {
  let score = 72 + (answer.length % 7); // base 72-78, content-derived
  const words = countWords(answer);

  // ── Longueur ──────────────────────────────────────────────────────────────
  if (words < 100) score -= 15;
  if (words >= 150) score += 5;
  if (words >= 200) score += 5;
  if (words >= 280) score += 5;
  if (words >= 380) score += 3;

  // ── Structure markdown ────────────────────────────────────────────────────
  if (/#{2,3}\s/.test(answer)) score += 6;
  if (/\*\*[^*]+\*\*/.test(answer)) score += 4;
  if (/\d\.\s/.test(answer)) score += 5;
  if (/[-•]\s/.test(answer)) score += 3;

  // ── Richesse locale ───────────────────────────────────────────────────────
  if (answer.toLowerCase().includes(businessName.toLowerCase())) score += 5;
  if (/\d{2}:\d{2}|\d{1,2}h\d{0,2}/i.test(answer)) score += 6; // horaires
  if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|0[1-9][\s.-]?\d{2}/i.test(answer)) score += 5; // téléphone
  if (/@|www\.|\.com|\.fr/i.test(answer)) score += 4; // contact web
  if (/\d+\s*(€|\$|£|euros?)/i.test(answer)) score += 6; // prix
  if (/202[4-9]|aujourd'hui|currently|now/i.test(answer)) score += 4; // temporalité
  if (/avis|note|étoile|rating|review/i.test(answer)) score += 4; // social proof
  if (/parking|accès|transport|métro|bus|PMR|accessible/i.test(answer)) score += 3;

  // ── Pénalités ────────────────────────────────────────────────────────────
  const vague = (answer.match(/généralement|souvent|parfois|peut-être|probablement/gi) || []).length;
  if (vague >= 3) score -= 8;
  if (/meilleur choix|solution idéale|best choice|ideal solution/i.test(answer)) score -= 10;

  return Math.min(98, Math.max(60, score));
}

function safeParseJSON<T>(raw: string): T {
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1].trim());
    } catch {}
  }
  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {}
  }
  throw new Error("Invalid JSON from AI");
}

/* =======================
   QUESTION TEMPLATES — catégorisées
======================= */
type QuestionCategory =
  | "hours" // horaires & accès
  | "contact" // coordonnées
  | "services" // offres & services
  | "pricing" // tarifs
  | "experience" // expérience client
  | "practical" // infos pratiques
  | "reputation" // avis & réputation
  | "comparison"; // différenciation

interface QuestionTemplate {
  question: (name: string) => string;
  category: QuestionCategory;
}

function getQuestionTemplates(
  language: string,
  businessName: string,
): { question: string; category: QuestionCategory }[] {
  const templates: QuestionTemplate[] =
    language === "fr"
      ? [
          // Hours & Access
          { question: (n) => `Quels sont les horaires d'ouverture de ${n} ?`, category: "hours" },
          { question: (n) => `${n} est-il ouvert le dimanche et les jours fériés ?`, category: "hours" },
          { question: (n) => `Quelle est la meilleure heure pour visiter ${n} sans attendre ?`, category: "hours" },
          { question: (n) => `Comment se rendre à ${n} en transports en commun ?`, category: "hours" },
          { question: (n) => `${n} dispose-t-il d'un parking gratuit à proximité ?`, category: "hours" },
          // Contact
          { question: (n) => `Comment contacter ${n} rapidement ?`, category: "contact" },
          { question: (n) => `${n} répond-il aux messages sur les réseaux sociaux ?`, category: "contact" },
          { question: (n) => `Peut-on réserver en ligne chez ${n} ?`, category: "contact" },
          // Services
          { question: (n) => `Quels services propose ${n} en 2026 ?`, category: "services" },
          { question: (n) => `${n} propose-t-il des services à domicile ou en ligne ?`, category: "services" },
          { question: (n) => `Quelles sont les spécialités et points forts de ${n} ?`, category: "services" },
          { question: (n) => `${n} organise-t-il des événements ou ateliers ?`, category: "services" },
          { question: (n) => `${n} propose-t-il des cartes cadeaux ?`, category: "services" },
          { question: (n) => `${n} a-t-il un programme de fidélité pour ses clients ?`, category: "services" },
          // Pricing
          { question: (n) => `Quel est le budget moyen pour une visite chez ${n} ?`, category: "pricing" },
          { question: (n) => `${n} propose-t-il des offres spéciales ou promotions ?`, category: "pricing" },
          { question: (n) => `Quels moyens de paiement ${n} accepte-t-il ?`, category: "pricing" },
          { question: (n) => `Le rapport qualité-prix chez ${n} est-il satisfaisant ?`, category: "pricing" },
          // Experience
          { question: (n) => `${n} est-il adapté aux familles avec enfants ?`, category: "experience" },
          { question: (n) => `${n} est-il accessible aux personnes à mobilité réduite ?`, category: "experience" },
          { question: (n) => `Quelle est l'ambiance chez ${n} ?`, category: "experience" },
          { question: (n) => `${n} convient-il pour un repas ou rendez-vous d'affaires ?`, category: "experience" },
          // Practical
          { question: (n) => `Faut-il réserver à l'avance chez ${n} ?`, category: "practical" },
          { question: (n) => `${n} accepte-t-il les animaux de compagnie ?`, category: "practical" },
          { question: (n) => `Combien de temps dure en moyenne une visite chez ${n} ?`, category: "practical" },
          // Reputation
          { question: (n) => `Quels sont les avis des clients sur ${n} ?`, category: "reputation" },
          { question: (n) => `${n} est-il recommandé par les habitants du quartier ?`, category: "reputation" },
          { question: (n) => `Que disent les experts et la presse de ${n} ?`, category: "reputation" },
          // Comparison
          { question: (n) => `Pourquoi choisir ${n} plutôt qu'un concurrent ?`, category: "comparison" },
          { question: (n) => `Quels sont les avantages uniques de ${n} dans son secteur ?`, category: "comparison" },
        ]
      : [
          // Hours & Access
          { question: (n) => `What are ${n}'s opening hours?`, category: "hours" },
          { question: (n) => `Is ${n} open on Sundays and public holidays?`, category: "hours" },
          { question: (n) => `What is the best time to visit ${n} without waiting?`, category: "hours" },
          { question: (n) => `How do I get to ${n} by public transport?`, category: "hours" },
          { question: (n) => `Does ${n} have free parking nearby?`, category: "hours" },
          // Contact
          { question: (n) => `How can I contact ${n} quickly?`, category: "contact" },
          { question: (n) => `Does ${n} respond to messages on social media?`, category: "contact" },
          { question: (n) => `Can I book online at ${n}?`, category: "contact" },
          // Services
          { question: (n) => `What services does ${n} offer in 2026?`, category: "services" },
          { question: (n) => `Does ${n} offer home delivery or online services?`, category: "services" },
          { question: (n) => `What are ${n}'s specialties and strengths?`, category: "services" },
          { question: (n) => `Does ${n} host events or workshops?`, category: "services" },
          { question: (n) => `Does ${n} sell gift cards?`, category: "services" },
          { question: (n) => `Does ${n} have a loyalty program?`, category: "services" },
          // Pricing
          { question: (n) => `What is the average budget for a visit to ${n}?`, category: "pricing" },
          { question: (n) => `Does ${n} offer special deals or promotions?`, category: "pricing" },
          { question: (n) => `What payment methods does ${n} accept?`, category: "pricing" },
          { question: (n) => `Is the value for money at ${n} good?`, category: "pricing" },
          // Experience
          { question: (n) => `Is ${n} family-friendly?`, category: "experience" },
          { question: (n) => `Is ${n} wheelchair accessible?`, category: "experience" },
          { question: (n) => `What is the atmosphere like at ${n}?`, category: "experience" },
          { question: (n) => `Is ${n} suitable for a business meeting?`, category: "experience" },
          // Practical
          { question: (n) => `Do I need to book in advance at ${n}?`, category: "practical" },
          { question: (n) => `Does ${n} allow pets?`, category: "practical" },
          { question: (n) => `How long does a typical visit to ${n} take?`, category: "practical" },
          // Reputation
          { question: (n) => `What do customers say about ${n}?`, category: "reputation" },
          { question: (n) => `Is ${n} recommended by locals?`, category: "reputation" },
          { question: (n) => `What do experts and the press say about ${n}?`, category: "reputation" },
          // Comparison
          { question: (n) => `Why choose ${n} over competitors?`, category: "comparison" },
          { question: (n) => `What are ${n}'s unique advantages in its sector?`, category: "comparison" },
        ];

  return templates.map((t) => ({ question: t.question(businessName), category: t.category }));
}

/* =======================
   BUILD RICH BUSINESS CONTEXT
======================= */
function buildBusinessContext(
  businessName: string,
  businessAddress: string,
  businessContext: Record<string, any>,
  language: string,
): string {
  const lines: string[] = [`Business Name: ${businessName}`];
  if (businessAddress) lines.push(`Address: ${businessAddress}`);
  if (businessContext?.rating)
    lines.push(`Rating: ${businessContext.rating}/5 (${businessContext.reviewCount || 0} reviews)`);
  if (businessContext?.types?.length) lines.push(`Business Type: ${businessContext.types.slice(0, 5).join(", ")}`);
  if (businessContext?.phone) lines.push(`Phone: ${businessContext.phone}`);
  if (businessContext?.website) lines.push(`Website: ${businessContext.website}`);
  if (businessContext?.email) lines.push(`Email: ${businessContext.email}`);
  if (businessContext?.openingHours?.length)
    lines.push(
      `Opening Hours:\n${businessContext.openingHours
        .slice(0, 7)
        .map((h: string) => `  - ${h}`)
        .join("\n")}`,
    );
  if (businessContext?.priceLevel)
    lines.push(`Price Level: ${"€".repeat(businessContext.priceLevel)} (${businessContext.priceLevel}/4)`);
  if (businessContext?.description) lines.push(`Description: ${businessContext.description}`);
  if (businessContext?.amenities?.length) lines.push(`Amenities: ${businessContext.amenities.join(", ")}`);
  if (businessContext?.keywords?.length) lines.push(`Keywords: ${businessContext.keywords.slice(0, 8).join(", ")}`);

  return lines.join("\n");
}

/* =======================
   SYSTEM PROMPT (shared)
======================= */
const SYSTEM_PROMPT_FR = `Tu es un expert AEO (Answer Engine Optimization) spécialisé dans le référencement local.
Tu rédiges des réponses que ChatGPT, Gemini, Perplexity et Claude vont CITER quand les utilisateurs posent des questions sur des établissements locaux.

PHILOSOPHIE:
- Chaque réponse doit être immédiatement utile — un lecteur obtient de la valeur dès la première phrase
- Écris comme un expert local de confiance, pas comme un rédacteur publicitaire
- Utilise toutes les données disponibles (horaires, tarifs, contact, avis) pour créer une réponse factuelle et riche
- La structure signale l'autorité aux moteurs IA

RÈGLES ABSOLUES:
1. Réponse directe dans la première phrase (répond clairement à la question)
2. 250-450 mots minimum — les réponses courtes ne sont PAS citées
3. Utilise le markdown: ## sous-titres, **gras**, listes à puces ou numérotées
4. Inclure des données concrètes: horaires exacts, prix, coordonnées, note
5. Mentionner le nom de l'établissement naturellement 2-4 fois
6. Aucun superlatif marketing ("meilleur", "incroyable", "unique")
7. Répondre UNIQUEMENT en JSON valide`;

const SYSTEM_PROMPT_EN = `You are an AEO (Answer Engine Optimization) expert specializing in local SEO.
You write answers that ChatGPT, Gemini, Perplexity, and Claude will CITE when users ask questions about local businesses.

PHILOSOPHY:
- Every answer must be immediately useful — a reader gets value in the first sentence
- Write like a trusted local expert, not a marketing copywriter
- Use all available data (hours, prices, contact, reviews) to create factual, rich answers
- Structure signals authority to AI engines

ABSOLUTE RULES:
1. Direct answer in the first sentence (clearly answers the question)
2. 250-450 words minimum — short answers are NOT cited
3. Use markdown: ## subheadings, **bold**, bullet or numbered lists
4. Include concrete data: exact hours, prices, contact info, rating
5. Mention the business name naturally 2-4 times
6. No marketing superlatives ("best", "amazing", "unique")
7. Respond ONLY in valid JSON`;

/* =======================
   CATEGORY-SPECIFIC PROMPT BLUEPRINTS
======================= */
function getCategoryBlueprint(category: QuestionCategory, language: string): string {
  const blueprints: Record<QuestionCategory, { fr: string; en: string }> = {
    hours: {
      fr: "1. Réponse directe avec les horaires précis\n2. Détail par jour de la semaine si disponible\n3. Exceptions (jours fériés, vacances)\n4. Meilleurs créneaux pour éviter l'affluence\n5. Informations d'accès (transport, parking)",
      en: "1. Direct answer with exact hours\n2. Day-by-day breakdown if available\n3. Exceptions (holidays, vacations)\n4. Best times to avoid crowds\n5. Access information (transport, parking)",
    },
    contact: {
      fr: "1. Canal de contact principal avec coordonnées\n2. Tous les moyens de contact disponibles\n3. Délai de réponse habituel\n4. Informations de réservation en ligne\n5. Réseaux sociaux et présence digitale",
      en: "1. Main contact channel with details\n2. All available contact methods\n3. Typical response time\n4. Online booking information\n5. Social media and digital presence",
    },
    services: {
      fr: "1. Liste des services principaux\n2. Services les plus populaires ou spécialités\n3. Services en ligne ou à domicile\n4. Nouveautés ou services saisonniers\n5. Comment accéder à ces services",
      en: "1. List of main services\n2. Most popular services or specialties\n3. Online or home delivery services\n4. New or seasonal services\n5. How to access these services",
    },
    pricing: {
      fr: "1. Fourchette de prix ou ticket moyen\n2. Détail par catégorie de produit/service\n3. Offres spéciales ou tarifs réduits\n4. Moyens de paiement acceptés\n5. Rapport qualité-prix vs concurrents",
      en: "1. Price range or average ticket\n2. Breakdown by product/service category\n3. Special offers or reduced rates\n4. Accepted payment methods\n5. Value for money vs competitors",
    },
    experience: {
      fr: "1. Description de l'ambiance ou de l'expérience\n2. Public cible (familles, pros, seniors...)\n3. Accessibilité et équipements spéciaux\n4. Ce qui rend la visite mémorable\n5. Conseils pour profiter au maximum",
      en: "1. Description of ambiance or experience\n2. Target audience (families, professionals...)\n3. Accessibility and special equipment\n4. What makes the visit memorable\n5. Tips to make the most of it",
    },
    practical: {
      fr: "1. Réponse directe à la question pratique\n2. Conditions ou exceptions à connaître\n3. Conseils pour planifier sa visite\n4. Ce qu'il faut apporter ou prévoir\n5. Informations complémentaires utiles",
      en: "1. Direct answer to the practical question\n2. Conditions or exceptions to know\n3. Tips for planning your visit\n4. What to bring or prepare\n5. Additional useful information",
    },
    reputation: {
      fr: "1. Note globale et nombre d'avis\n2. Points les plus appréciés par les clients\n3. Quelques avis représentatifs (paraphrasés)\n4. Réponse de l'établissement aux critiques\n5. Recommandations contextualisées",
      en: "1. Overall rating and number of reviews\n2. Most appreciated points by customers\n3. A few representative reviews (paraphrased)\n4. Business response to criticism\n5. Contextualized recommendations",
    },
    comparison: {
      fr: "1. Avantage principal par rapport aux alternatives\n2. Ce qui différencie concrètement l'établissement\n3. Pour quel profil de client c'est le meilleur choix\n4. Limites ou points à améliorer (honnêteté)\n5. Conclusion avec recommandation nuancée",
      en: "1. Main advantage over alternatives\n2. What concretely differentiates the business\n3. Which customer profile it's best for\n4. Limitations or areas for improvement (honesty)\n5. Conclusion with nuanced recommendation",
    },
  };

  const b = blueprints[category] || blueprints.services;
  return language === "fr" ? b.fr : b.en;
}

/* =======================
   GENERATE ONE ANSWER
======================= */
async function generateLocalAnswer(
  question: string,
  category: QuestionCategory,
  businessContext: string,
  businessName: string,
  language: string,
  apiKey: string,
): Promise<{ answer: string; bullets: string[] }> {
  const lang = language === "fr" ? "French" : "English";
  const blueprint = getCategoryBlueprint(category, language);
  const systemPrompt = language === "fr" ? SYSTEM_PROMPT_FR : SYSTEM_PROMPT_EN;

  const userPrompt = `${businessContext}

Question: "${question}"
Category: ${category}
Language: ${lang}

BLUEPRINT to follow for this "${category}" type question:
${blueprint}

REQUIREMENTS:
- "answer" field: 250-450 words in markdown format
  • Start with a 1-2 sentence direct answer
  • Use ## for subsections where relevant
  • Use **bold** for key info (hours, prices, phone)
  • Use bullet lists for multiple items
  • Mention "${businessName}" 2-4 times naturally
  • Include ALL available data from the business context
- "bullets" field: 4-5 key takeaways (15-25 words each)

Return ONLY valid JSON:
{
  "answer": "## [Direct Answer]\\n\\n[250-450 words markdown]...",
  "bullets": ["Key info 1...", "Key info 2...", "Key info 3...", "Key info 4..."]
}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.45,
      max_tokens: 2000, // ← CRITIQUE : assez pour 300-450 mots en markdown
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content ?? "";
  if (!raw) throw new Error("Empty AI response");

  const parsed = safeParseJSON<{ answer: string; bullets: string[] }>(raw);

  // NO FALLBACK - reject too-short AI output instead of padding it
  const words = countWords(parsed.answer || "");
  if (words < 80) {
    throw new Error(`AI returned too-short answer (${words} words) for "${question}" — refusing to publish placeholder content`);
  }


  return parsed;
}

/* =======================
   MAIN HANDLER
======================= */
serve(async (req) => {
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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { projectId, businessId, businessName, businessAddress, businessContext } = await req.json();

    if (!projectId || !businessName) {
      return new Response(JSON.stringify({ error: "projectId and businessName are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-30-local] Starting for: "${businessName}"`);

    // ── Language ──────────────────────────────────────────────────────────
    const { data: project } = await supabase.from("projects").select("language").eq("id", projectId).single();
    const { data: settings } = await supabase
      .from("generation_settings")
      .select("language")
      .eq("project_id", projectId)
      .single();
    const language = settings?.language || project?.language || "en";

    console.log(`[generate-30-local] Language: ${language}`);

    // ── Build business context string ─────────────────────────────────────
    const contextString = buildBusinessContext(businessName, businessAddress || "", businessContext || {}, language);

    // ── Questions list ────────────────────────────────────────────────────
    const questionList = getQuestionTemplates(language, businessName);
    const today = new Date();
    const createdAnswers: { id: string; question: string; score: number; scheduled_date: string }[] = [];

    // Only schedule on Mon(1), Wed(3), Fri(5) — 3 quality posts per week
    const PUBLISH_DAYS = new Set([1, 3, 5]);
    // Build list of next 30 valid publish dates
    const publishDates: Date[] = [];
    for (let offset = 0; publishDates.length < 30; offset++) {
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      if (PUBLISH_DAYS.has(d.getDay())) publishDates.push(d);
    }

    for (let i = 0; i < 30; i++) {
      const { question, category } = questionList[i % questionList.length];
      const scheduledDate = publishDates[i % publishDates.length];
      const scheduledDateStr = scheduledDate.toISOString().split("T")[0];

      console.log(`[generate-30-local] [${i + 1}/30] ${category} | "${question.substring(0, 50)}..."`);

      try {
        const generated = await generateLocalAnswer(
          question,
          category,
          contextString,
          businessName,
          language,
          OPENROUTER_API_KEY!,
        );

        // ── Claude review (post-generation polish) ──
        if (generated.answer) {
          const reviewed = await reviewWithClaude({
            content: generated.answer,
            contentType: "local_answer",
            language,
            brand: businessName,
            question,
          });
          generated.answer = reviewed.content;
        }

        const words = countWords(generated.answer);
        const score = computeLocalScore(generated.answer, businessName);

        console.log(`[generate-30-local] ✓ words=${words} | score=${score}`);

        const slug = generateSlug(question);

        const { data: inserted, error: insertError } = await supabase
          .from("local_answers")
          .insert({
            project_id: projectId,
            business_id: businessId,
            business_name: businessName,
            question,
            answer: generated.answer,
            score,
            slug,
            scheduled_date: scheduledDateStr,
            language,
            is_public: false,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error(`[generate-30-local] DB insert error:`, insertError.message);
          continue;
        }

        createdAnswers.push({ id: inserted.id, question, score, scheduled_date: scheduledDateStr });

        // Anti rate-limit
        if (i < 29) await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        console.error(`[generate-30-local] Generation error for Q${i + 1}:`, err);
        // Continue — ne pas avorter tout le batch
      }
    }

    console.log(`[generate-30-local] ✅ Done — ${createdAnswers.length}/30 answers created.`);

    return new Response(JSON.stringify({ success: true, created: createdAnswers.length, answers: createdAnswers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[generate-30-local] Fatal error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
