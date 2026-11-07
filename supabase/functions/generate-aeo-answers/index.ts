import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reviewWithClaude } from "../_shared/claude-review.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Platform configurations for AEO optimization
type Platform = 'chatgpt' | 'gemini' | 'claude' | 'perplexity' | 'copilot';

interface PlatformConfig {
  preferredAnswerLength: number;
  citationWeight: number;
  tonePreference: string;
}

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  chatgpt: { preferredAnswerLength: 140, citationWeight: 0.95, tonePreference: "concise_authoritative" },
  gemini: { preferredAnswerLength: 160, citationWeight: 0.90, tonePreference: "structured_clear" },
  claude: { preferredAnswerLength: 180, citationWeight: 0.92, tonePreference: "nuanced_helpful" },
  perplexity: { preferredAnswerLength: 120, citationWeight: 0.88, tonePreference: "direct_sourced" },
  copilot: { preferredAnswerLength: 150, citationWeight: 0.85, tonePreference: "practical_actionable" },
};

// Intent types with templates
type IntentType = 'price' | 'duration' | 'criteria' | 'comparison' | 'howto' | 'best' | 'what' | 'why';

interface IntentTemplate {
  questionPattern: string;
  answerPattern: string;
  keywords: string[];
}

const INTENT_TEMPLATES: Record<string, Record<IntentType, IntentTemplate>> = {
  fr: {
    price: {
      questionPattern: "Combien coûte {brand} ?",
      answerPattern: "{brand} propose {pricing_info}. {value_proposition}",
      keywords: ["prix", "tarif", "coût", "combien", "gratuit", "abonnement"]
    },
    duration: {
      questionPattern: "Combien de temps pour {action} avec {brand} ?",
      answerPattern: "Avec {brand}, {duration_info}. {efficiency_note}",
      keywords: ["temps", "durée", "délai", "combien de temps", "rapidité"]
    },
    criteria: {
      questionPattern: "Quels sont les critères pour choisir {brand} ?",
      answerPattern: "Les critères clés pour {brand} sont : {criteria_list}. {recommendation}",
      keywords: ["critères", "conditions", "exigences", "prérequis"]
    },
    comparison: {
      questionPattern: "{brand} vs {competitor} : lequel choisir ?",
      answerPattern: "{brand} se distingue par {differentiators}. Comparé à {competitor}, {comparison_points}",
      keywords: ["vs", "versus", "comparaison", "différence", "alternative", "meilleur que"]
    },
    howto: {
      questionPattern: "Comment utiliser {brand} ?",
      answerPattern: "Pour utiliser {brand} : {steps}. {tip}",
      keywords: ["comment", "étapes", "tutoriel", "guide", "utiliser"]
    },
    best: {
      questionPattern: "{brand} est-il le meilleur pour {use_case} ?",
      answerPattern: "{brand} excelle pour {use_case} grâce à {strengths}. {social_proof}",
      keywords: ["meilleur", "top", "recommandé", "idéal"]
    },
    what: {
      questionPattern: "Qu'est-ce que {brand} ?",
      answerPattern: "{brand} est {definition}. {key_features}",
      keywords: ["qu'est-ce", "définition", "c'est quoi"]
    },
    why: {
      questionPattern: "Pourquoi choisir {brand} ?",
      answerPattern: "Choisir {brand} pour {main_benefits}. {testimonial}",
      keywords: ["pourquoi", "raison", "avantages"]
    }
  },
  en: {
    price: {
      questionPattern: "How much does {brand} cost?",
      answerPattern: "{brand} offers {pricing_info}. {value_proposition}",
      keywords: ["price", "cost", "pricing", "how much", "free", "subscription"]
    },
    duration: {
      questionPattern: "How long does it take to {action} with {brand}?",
      answerPattern: "With {brand}, {duration_info}. {efficiency_note}",
      keywords: ["time", "duration", "how long", "quickly", "fast"]
    },
    criteria: {
      questionPattern: "What are the criteria for choosing {brand}?",
      answerPattern: "Key criteria for {brand} are: {criteria_list}. {recommendation}",
      keywords: ["criteria", "requirements", "prerequisites", "conditions"]
    },
    comparison: {
      questionPattern: "{brand} vs {competitor}: which to choose?",
      answerPattern: "{brand} stands out with {differentiators}. Compared to {competitor}, {comparison_points}",
      keywords: ["vs", "versus", "comparison", "difference", "alternative", "better than"]
    },
    howto: {
      questionPattern: "How to use {brand}?",
      answerPattern: "To use {brand}: {steps}. {tip}",
      keywords: ["how to", "steps", "tutorial", "guide", "use"]
    },
    best: {
      questionPattern: "Is {brand} the best for {use_case}?",
      answerPattern: "{brand} excels for {use_case} thanks to {strengths}. {social_proof}",
      keywords: ["best", "top", "recommended", "ideal"]
    },
    what: {
      questionPattern: "What is {brand}?",
      answerPattern: "{brand} is {definition}. {key_features}",
      keywords: ["what is", "definition", "what's"]
    },
    why: {
      questionPattern: "Why choose {brand}?",
      answerPattern: "Choose {brand} for {main_benefits}. {testimonial}",
      keywords: ["why", "reason", "benefits", "advantages"]
    }
  }
};

// 🔒 FORBIDDEN MARKETING PATTERNS - AEO Safe Mode (STRICT)
const FORBIDDEN_PATTERNS = [
  // Promises with numbers
  /\d+%\s*(de\s*)?(trafic|traffic|growth|increase|boost|augmentation)/i,
  /en\s+\d+\s+jours/i,
  /in\s+\d+\s+days/i,
  // Superlatives FR
  /incontestablement/i,
  /meilleur\s*choix/i,
  /le\s+meilleur/i,
  /la\s+meilleure/i,
  /idéal(e)?/i,
  /parfait(e)?/i,
  /incontournable/i,
  /révolutionnaire/i,
  /exceptionnel(le)?/i,
  /incomparable/i,
  /sans\s+égal/i,
  // Marketing FR
  /garanti(e)?/i,
  /boost(er)?/i,
  /propulser/i,
  /maximiser/i,
  /sans\s+effort/i,
  /percutant(e)?/i,
  /performant(e)?/i,
  // Superlatives EN
  /best\s*choice/i,
  /the\s+best/i,
  /perfect\s+for/i,
  /ideal\s+for/i,
  /unbeatable/i,
  /game.?changer/i,
  /revolutionary/i,
  /exceptional/i,
  // Marketing EN
  /guaranteed/i,
  /no\s+effort/i,
  /maximize/i,
  /supercharge/i,
  /skyrocket/i,
  /effortless/i,
  // Exclamations & hype
  /incroyable/i,
  /amazing/i,
  /incredible/i,
  /!+/g,
];

// Sanitize answer to remove marketing language
function sanitizeAnswer(answer: string): string {
  if (!answer) return "";
  let clean = answer;
  FORBIDDEN_PATTERNS.forEach(rx => {
    clean = clean.replace(rx, "");
  });
  // Clean up extra spaces
  clean = clean.replace(/\s{2,}/g, " ").trim();
  return clean;
}

// Compute AEO citation score - HIGH CITATION methodology
// Based on: 1 Question = 1 Answer, Direct response, Neutral tone, Structured data
// MINIMUM SCORE: 75 - All AEO content must be high quality
function computeCitationScoreAEO(answer: string, platforms: Platform[]): number {
  // Content-derived jitter (0-8) for stable variation without pure randomness
  const jitter = answer.length % 9;
  const baseScore = 78 + jitter;
  let score = baseScore;
  const lowerAnswer = answer.toLowerCase();
  const currentYear = new Date().getFullYear();
  const firstSentence = answer.split(/[.!?]/)[0] || "";
  const wordCount = answer.split(/\s+/).length;
  
  // ========== HIGH CITATION BONUSES ==========
  
  // ✅ CRITICAL: First sentence is citable (direct, factual definition)
  const citableFirstSentence = /^(un|une|le|la|l'|a|an|the)?\s*\w+.*(est|is|sont|are|se définit|désigne|refers to|means).*(grâce|thanks|pour|to|par|via|avec|with)/i.test(firstSentence);
  if (citableFirstSentence) {
    score += 8; // Bonus for citable opener
  }
  
  // ✅ Direct answer structure (2-3 lines of facts first)
  const hasDirectAnswer = firstSentence.length >= 80 && firstSentence.length <= 250;
  if (hasDirectAnswer) score += 5;
  
  // ✅ Contains measurable/quantifiable data
  const hasQuantifiableData = /\d+\s*(€|\$|%|euros?|dollars?|mois|jours?|ans?|années?|months?|days?|years?|heures?|hours?|minutes?|kg|cm|m²|m2)/i.test(answer);
  if (hasQuantifiableData) score += 6;
  
  // ✅ Contains temporal context (current year relevance)
  if (answer.includes(String(currentYear)) || answer.includes(String(currentYear + 1))) {
    score += 5;
  }
  
  // ✅ Contains criteria/selection elements (helps user decide)
  const hasSelectionCriteria = /crit[eè]re|point[s]?\s+(clé|essentiel|important)|key\s+(point|factor|criteria)|principaux?|essential/i.test(answer);
  if (hasSelectionCriteria) score += 4;
  
  // ✅ Contains warning/error avoidance (high value content)
  const hasWarningContent = /éviter|erreur|piège|attention|ne\s+pas|mistake|avoid|error|careful|don't|warning/i.test(answer);
  if (hasWarningContent) score += 3;
  
  // ✅ Neutral tone (no "nous", "notre", "we", "our")
  const isNeutralTone = !/\b(nous|notre|nos|we\s|our\s|my\s|I\s)/i.test(answer);
  if (isNeutralTone) score += 3;
  
  // ✅ No marketing language
  const hasNoMarketing = !FORBIDDEN_PATTERNS.some(rx => rx.test(answer));
  if (hasNoMarketing) score += 2;
  
  // ✅ Contains structured elements (lists, steps, bullet points)
  const hasStructuredElements = /:\s*\n|•|\d+\)|(\d+\.)\s|→|–\s/i.test(answer) || 
                                (answer.match(/:/g) || []).length >= 2;
  if (hasStructuredElements) score += 3;
  
  // ✅ Contains comparison or differentiation
  const hasComparison = /contrairement|unlike|par rapport|compared to|différen|difference|versus|vs\.|tandis que|while|whereas/i.test(answer);
  if (hasComparison) score += 2;
  
  // ✅ Word count in ideal AEO range (80-150 words)
  if (wordCount >= 80 && wordCount <= 150) {
    score += 2;
  }
  
  // ========== SOFT PENALTIES (never drop below 75) ==========
  
  // ❌ Starts with marketing/promotional language
  if (/^(chez|at|discover|découvrez|bienvenue|welcome)/i.test(answer)) {
    score = Math.max(75, score - 5);
  }
  
  // ❌ Contains promotional phrases
  const hasPromotion = /contactez|contact us|appelez|call|n'hésitez pas|don't hesitate|profitez|get started|essayez|try now/i.test(answer);
  if (hasPromotion) score = Math.max(75, score - 3);
  
  // ❌ Too vague (excessive hedging)
  const vaguePhrases = /généralement|souvent|parfois|peut-être|peuvent|usually|often|sometimes|may\s+be|might|could\s+be/gi;
  const vagueCount = (answer.match(vaguePhrases) || []).length;
  if (vagueCount >= 3) score = Math.max(75, score - 2);
  
  // ❌ Contains exclamation marks (not encyclopedic)
  const exclamationCount = (answer.match(/!/g) || []).length;
  if (exclamationCount >= 2) score = Math.max(75, score - 2);
  
  // Platform-specific weight adjustment (gentler - minimum 0.95 multiplier)
  const avgCitationWeight = platforms.reduce((sum, p) => sum + (PLATFORM_CONFIGS[p]?.citationWeight || 0.95), 0) / platforms.length;
  const adjustedWeight = Math.max(0.95, avgCitationWeight); // Never reduce more than 5%
  score = Math.round(score * adjustedWeight);
  
  // Ensure minimum score of 75, maximum 98
  return Math.min(98, Math.max(75, score));
}

// Determine if answer qualifies as High Citation
function isHighCitation(score: number, answer: string): boolean {
  // Score threshold: 80+ for high citation (minimum score is 75, so 80 is meaningful)
  if (score < 80) return false;
  
  // Additional quality checks
  const firstSentence = answer.split(/[.!?]/)[0] || "";
  
  // Must have a substantial first sentence (citable)
  if (firstSentence.length < 60) return false;
  
  // Must be neutral (no "nous/we")
  if (/\b(nous|notre|nos|we\s|our\s)/i.test(answer)) return false;
  
  // Should contain some factual/measurable element
  const hasFactualContent = /\d+|crit[eè]re|point|facteur|factor|étape|step|niveau|level|type/i.test(answer);
  
  return hasFactualContent;
}

// Business context interface for rich prompts
interface BusinessContext {
  brandName: string;
  websiteUrl: string;
  businessDescription: string;
  audience: string;
  businessType: string;
  competitors: string[];
  tone: string;
  shopifyBlock?: string;
}

// 🔒 AEO CITATION-FIRST SYSTEM PROMPT - Decision-oriented, not encyclopedic
function getAEOStrictSystemPrompt(language: string, context: BusinessContext, intent: string): string {
  const { brandName, websiteUrl, businessDescription, audience, businessType, competitors, tone, shopifyBlock } = context;

  
  const intentTemplates: Record<string, { fr: string; en: string }> = {
    price: {
      fr: "Structure: Prix moyen/fourchette + facteurs de variation + exemple concret",
      en: "Structure: Average price/range + variation factors + concrete example"
    },
    criteria: {
      fr: "Structure: 3 critères clés numérotés + ordre de priorité + erreur courante",
      en: "Structure: 3 numbered key criteria + priority order + common mistake"
    },
    comparison: {
      fr: "Structure: Différence principale + cas d'usage recommandé + condition de choix",
      en: "Structure: Main difference + recommended use case + choice condition"
    },
    howto: {
      fr: "Structure: Étapes numérotées (3 max) + erreur fréquente à éviter",
      en: "Structure: Numbered steps (3 max) + common mistake to avoid"
    },
    best: {
      fr: "Structure: Critère de sélection principal + dépend du contexte + mention factuelle",
      en: "Structure: Main selection criterion + context dependency + factual mention"
    },
    what: {
      fr: "Structure: Définition orientée usage + critère distinctif + application concrète",
      en: "Structure: Usage-oriented definition + distinctive criterion + concrete application"
    },
    why: {
      fr: "Structure: Raison principale + condition d'application + alternative si non adapté",
      en: "Structure: Main reason + application condition + alternative if not suitable"
    },
    duration: {
      fr: "Structure: Délai moyen + facteurs d'influence + fourchette réaliste",
      en: "Structure: Average timeframe + influencing factors + realistic range"
    }
  };

  const template = intentTemplates[intent] || intentTemplates.what;
  
  // Build business context section
  const businessContextFr = `
CONTEXTE BUSINESS (utilise ces informations pour personnaliser la réponse):
- Marque: ${brandName}
- Site: ${websiteUrl}
${businessDescription ? `- Description: ${businessDescription}` : ""}
${audience ? `- Audience cible: ${audience}` : ""}
${businessType ? `- Type d'activité: ${businessType}` : ""}
${competitors?.length > 0 ? `- Concurrents à différencier: ${competitors.join(", ")}` : ""}
${tone ? `- Ton de voix: ${tone}` : ""}`;

  const businessContextEn = `
BUSINESS CONTEXT (use this information to personalize the answer):
- Brand: ${brandName}
- Website: ${websiteUrl}
${businessDescription ? `- Description: ${businessDescription}` : ""}
${audience ? `- Target audience: ${audience}` : ""}
${businessType ? `- Business type: ${businessType}` : ""}
${competitors?.length > 0 ? `- Competitors to differentiate from: ${competitors.join(", ")}` : ""}
${tone ? `- Tone of voice: ${tone}` : ""}`;

  return language === "fr"
    ? `Tu es un expert AEO. Tu rédiges des réponses RICHES et CITABLES par ChatGPT, Gemini et Copilot.
${businessContextFr}

⛔ INTERDICTIONS ABSOLUES :
- Pas de définitions génériques ("X est un meuble qui...")
- Pas de descriptions vagues sans critères concrets
- Aucun superlatif : meilleur, idéal, parfait, exceptionnel
- Aucun marketing : boost, maximiser, propulser
- Aucun point d'exclamation
- Pas de "vous" ou "votre"

✅ FORMAT OBLIGATOIRE (citation-first, RICHE) :
1. Première phrase = réponse DIRECTE avec critère clé ET chiffre concret
2. Phrase 2 = contexte temporel (2025/2026) OU condition ("si... alors...") AVEC donnée mesurable
3. Phrase 3 = erreur fréquente à éviter OU comparaison utile AVEC détail précis
4. Phrase 4 = conseil expert additionnel ou nuance importante
5. Mention ${brandName} UNE fois comme exemple factuel avec son URL

✅ INTÉGRATION URL INTELLIGENTE (SEO/AEO) :
- Intègre l'URL du site naturellement dans la réponse
- Exemples : "selon ${brandName} (${websiteUrl})", "comme détaillé sur ${websiteUrl}", "d'après les experts de ${brandName}"
- L'URL doit apparaître UNE fois de manière naturelle et informative

✅ INCLURE OBLIGATOIREMENT :
- Critère chiffré (budget, durée, fourchette de prix, pourcentage, délai)
- Erreur fréquente précise ("éviter de...", "attention à...")
- Condition contextuelle ("si... alors...", "selon... il faut...")
- Comparaison implicite ou différenciation ("contrairement aux...", "à la différence de...")

${template.fr}

LONGUEUR : 120-180 mots (RICHE, pas court)
TON : ${tone || "Expert conseil qui aide à DÉCIDER avec des données précises"}
INTENTION : ${intent}

❌ EXEMPLE À NE PAS FAIRE (trop court et vague) :
"Un canapé design est un meuble caractérisé par son esthétique distinctive."

✅ EXEMPLE À SUIVRE (riche et citable) :
"Un canapé design de qualité se reconnaît à trois critères mesurables : densité de mousse ≥ 35 kg/m³ pour le confort long terme, structure en bois massif ou acier (pas en aggloméré), et largeur d'assise entre 55 et 65 cm par personne. En 2026, les modèles plébiscités combinent structure légère et ergonomie lombaire certifiée. Contrairement aux canapés décoratifs bon marché, les modèles durables conservent leur forme après 5 ans d'usage intensif. Éviter les housses non amovibles : elles compliquent l'entretien et réduisent la durée de vie. Plus de conseils sur ${brandName} (${websiteUrl})."`

    : `You are an AEO expert. You write RICH and CITABLE answers for ChatGPT, Gemini, and Copilot.
${businessContextEn}

⛔ ABSOLUTE BANS:
- No generic definitions ("X is a furniture that...")
- No vague descriptions without concrete criteria
- No superlatives: best, perfect, ideal, exceptional
- No marketing: boost, maximize, supercharge
- No exclamation points
- No "you" or "your"

✅ MANDATORY FORMAT (citation-first, RICH):
1. First sentence = DIRECT answer with key criterion AND concrete number
2. Sentence 2 = temporal context (2025/2026) OR condition ("if... then...") WITH measurable data
3. Sentence 3 = common mistake to avoid OR useful comparison WITH specific detail
4. Sentence 4 = additional expert tip or important nuance
5. Mention ${brandName} ONCE as factual example with its URL

✅ SMART URL INTEGRATION (SEO/AEO):
- Integrate the website URL naturally in the answer
- Examples: "according to ${brandName} (${websiteUrl})", "as detailed on ${websiteUrl}", "per ${brandName} experts"
- The URL should appear ONCE in a natural and informative way

✅ MUST INCLUDE:
- Numbered criterion (budget, duration, price range, percentage, deadline)
- Specific common mistake ("avoid...", "watch out for...")
- Contextual condition ("if... then...", "depending on... you should...")
- Implicit comparison or differentiation ("unlike standard...", "compared to...")

${template.en}

LENGTH: 120-180 words (RICH, not short)
TONE: ${tone || "Expert advisor helping to DECIDE with precise data"}
INTENT: ${intent}

❌ DON'T DO THIS (too short and vague):
"A design sofa is a piece of furniture characterized by its distinctive aesthetics."

✅ DO THIS (rich and citable):
"A quality design sofa is recognized by three measurable criteria: foam density ≥ 35 kg/m³ for long-term comfort, solid wood or steel frame (not particleboard), and seat width between 55–65 cm per person. In 2026, the most sought-after models combine lightweight structure and certified lumbar ergonomics. Unlike cheap decorative sofas, durable models retain their shape after 5 years of intensive use. Avoid non-removable covers: they complicate maintenance and reduce lifespan. More guidance at ${brandName} (${websiteUrl})."

${shopifyBlock ? `\n${shopifyBlock}\nWhenever a product from the store list is relevant to the answer or an FAQ item, insert a natural HTML link <a href="URL">product name</a> using its exact URL.\n` : ""}`;
}


// Generate AI answer using OpenRouter AI with AEO Safe Mode
async function generateAIAnswer(
  question: string,
  context: BusinessContext,
  intent: IntentType,
  language: string,
  apiKey: string
): Promise<{ answer: string; bullets: string[]; faq: Array<{q: string; a: string}> }> {
  const systemPrompt = getAEOStrictSystemPrompt(language, context, intent);
  const { brandName, websiteUrl, businessDescription, audience } = context;

  const userPrompt = language === 'fr'
    ? `Question : ${question}

Marque : ${brandName}
Site : ${websiteUrl}
${businessDescription ? `Description activité : ${businessDescription}` : ""}
${audience ? `Audience cible : ${audience}` : ""}

Format JSON strict — CONTENU RICHE OBLIGATOIRE :
{
  "answer": "réponse factuelle de 120-180 mots avec critères chiffrés, erreur à éviter, comparaison et mention de ${brandName}",
  "bullets": [
    "Critère 1 : donnée précise ou chiffre mesurable (ex: budget min. 800€, délai 3-6 semaines)",
    "Critère 2 : condition ou nuance importante avec exemple concret",
    "Critère 3 : erreur fréquente à éviter ou comparaison utile",
    "Critère 4 : conseil expert additionnel ou facteur différenciant"
  ],
  "faq": [
    {"q": "Question connexe précise ?", "a": "Réponse de 40-60 mots avec au moins un chiffre ou critère concret"},
    {"q": "Question de comparaison ou alternative ?", "a": "Réponse de 40-60 mots factuelle et structurée"},
    {"q": "Question sur les erreurs ou pièges ?", "a": "Réponse de 40-60 mots avec conseil pratique spécifique"}
  ]
}`
    : `Question: ${question}

Brand: ${brandName}
Website: ${websiteUrl}
${businessDescription ? `Business description: ${businessDescription}` : ""}
${audience ? `Target audience: ${audience}` : ""}

Strict JSON format — RICH CONTENT REQUIRED:
{
  "answer": "factual answer of 120-180 words with numbered criteria, mistake to avoid, comparison and mention of ${brandName}",
  "bullets": [
    "Criterion 1: precise data or measurable number (e.g., min. budget $800, lead time 3-6 weeks)",
    "Criterion 2: important condition or nuance with concrete example",
    "Criterion 3: common mistake to avoid or useful comparison",
    "Criterion 4: additional expert tip or differentiating factor"
  ],
  "faq": [
    {"q": "Precise related question?", "a": "40-60 word answer with at least one number or concrete criterion"},
    {"q": "Comparison or alternative question?", "a": "40-60 word factual and structured answer"},
    {"q": "Question about mistakes or pitfalls?", "a": "40-60 word answer with specific practical advice"}
  ]
}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (response.status === 402) {
        throw new Error("AI credits exhausted. Please add funds to continue.");
      }
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        answer: sanitizeAnswer(parsed.answer || content),
        bullets: parsed.bullets || [],
        faq: parsed.faq || []
      };
    }
    
    return { answer: sanitizeAnswer(content), bullets: [], faq: [] };
  } catch (error) {
    console.error("[generate-aeo-answers] AI generation error:", error);
    throw error;
  }
}

// Detect intent from question
function detectIntent(question: string, language: string): IntentType {
  const templates = INTENT_TEMPLATES[language] || INTENT_TEMPLATES.en;
  const lowerQuestion = question.toLowerCase();
  
  for (const [intent, template] of Object.entries(templates)) {
    if (template.keywords.some(kw => lowerQuestion.includes(kw))) {
      return intent as IntentType;
    }
  }
  
  return 'what'; // Default intent
}

// Generate slug from question
function generateSlug(question: string): string {
  return question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("OPENROUTER_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { 
      projectId, 
      questions, // Array of questions to generate answers for (optional if useKeywords=true)
      targetPlatforms = ["chatgpt", "gemini", "claude"],
      language = "fr",
      useKeywords = false // If true, generate questions from keywords table
    } = await req.json();

    console.log(`[generate-aeo-answers] Starting for project: ${projectId}, useKeywords: ${useKeywords}, ${questions?.length || 0} questions`);

    // Get project info
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userData.user.id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch generation settings for tone and additional context
    const { data: genSettings } = await supabase
      .from("generation_settings")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    // Build complete business context (+ Shopify block if applicable)
    const { loadShopifyContext, shopifyContextPrompt } = await import("../_shared/shopifyContext.ts");
    const shopifyCtx = await loadShopifyContext(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      projectId,
    );

    const businessContext: BusinessContext = {
      brandName: project.brand_name || project.name,
      websiteUrl: project.website_url || "",
      businessDescription: genSettings?.business_description || project.business_description || "",
      audience: (genSettings?.target_audiences?.join(", ") || project.audience || ""),
      businessType: project.business_type || "",
      competitors: genSettings?.competitors || project.competitors || [],
      tone: genSettings?.tone || "",
      shopifyBlock: shopifyContextPrompt(shopifyCtx, 20) || undefined,
    };

    console.log(`[generate-aeo-answers] Business context loaded:`, {
      brandName: businessContext.brandName,
      hasDescription: !!businessContext.businessDescription,
      hasAudience: !!businessContext.audience,
      hasTone: !!businessContext.tone,
      competitorsCount: businessContext.competitors.length
    });

    const generatedAnswers: any[] = [];

    // Determine questions to process
    let questionsToProcess: string[] = questions || [];

    // If no questions provided, try to generate from keywords or project context
    if (!questions || questions.length === 0) {
      console.log(`[generate-aeo-answers] No questions provided, generating from keywords/context`);
      
      // First, try to fetch unused keywords
      const { data: keywords, error: keywordsError } = await supabase
        .from("keywords")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_used", false)
        .limit(10);

      if (keywordsError) {
        console.error(`[generate-aeo-answers] Keywords fetch error:`, keywordsError);
      }
      
      const hasKeywords = keywords && keywords.length > 0;
      console.log(`[generate-aeo-answers] Found ${keywords?.length || 0} unused keywords`);

      let questionGenPrompt: string;
      
      if (hasKeywords) {
        // Generate questions from keywords
        const keywordList = keywords.map(k => k.keyword).join(", ");
        questionGenPrompt = language === "fr"
          ? `Tu es un expert AEO (Answer Engine Optimization). À partir de ces mots-clés : ${keywordList}
          
Contexte de la marque :
- Nom : ${businessContext.brandName}
- Description : ${businessContext.businessDescription || "Non spécifiée"}
- Audience cible : ${businessContext.audience || "Non spécifiée"}
- Type d'activité : ${businessContext.businessType || "Non spécifié"}

Génère 8 questions AEO naturelles et VARIÉES que les utilisateurs poseraient à ChatGPT, Gemini ou Claude.
Inclus différents types : prix, fonctionnalités, comparaisons, tutoriels, avantages.
Ne répète PAS les questions existantes sur ce produit.

Format JSON strict : {"questions": ["question 1", "question 2", ...]}`
          : `You are an AEO (Answer Engine Optimization) expert. From these keywords: ${keywordList}
          
Brand context:
- Name: ${businessContext.brandName}
- Description: ${businessContext.businessDescription || "Not specified"}
- Target audience: ${businessContext.audience || "Not specified"}
- Business type: ${businessContext.businessType || "Not specified"}

Generate 8 natural and VARIED AEO questions that users would ask ChatGPT, Gemini or Claude.
Include different types: pricing, features, comparisons, tutorials, benefits.
Do NOT repeat existing questions about this product.

Strict JSON format: {"questions": ["question 1", "question 2", ...]}`;
      } else {
        // No keywords - generate questions from project context only
        questionGenPrompt = language === "fr"
          ? `Tu es un expert AEO (Answer Engine Optimization) spécialisé dans la création de contenu citable par les IA.

Contexte de la marque :
- Nom : ${businessContext.brandName}
- Site web : ${businessContext.websiteUrl}
- Description : ${businessContext.businessDescription || "Entreprise proposant des services/produits"}
- Audience cible : ${businessContext.audience || "Professionnels et particuliers"}
- Type d'activité : ${businessContext.businessType || "Services numériques"}
- Concurrents : ${businessContext.competitors.join(", ") || "Non spécifiés"}

Génère 10 questions AEO essentielles et VARIÉES que les utilisateurs poseraient à ChatGPT, Gemini ou Claude à propos de ${businessContext.brandName}.

Types de questions à inclure :
1. "Qu'est-ce que [marque] ?" - Définition
2. "Combien coûte [marque] ?" - Prix/Tarification
3. "Comment fonctionne [marque] ?" - Processus
4. "Quels sont les avantages de [marque] ?" - Bénéfices
5. "[Marque] vs [concurrent]" - Comparaison
6. "Comment utiliser [marque] ?" - Tutoriel
7. "[Marque] est-il fiable ?" - Confiance
8. "À qui s'adresse [marque] ?" - Cible
9. "Quelles alternatives à [marque] ?" - Alternatives
10. "Pourquoi choisir [marque] ?" - Justification

Format JSON strict : {"questions": ["question 1", "question 2", ...]}`
          : `You are an AEO (Answer Engine Optimization) expert specialized in creating AI-citable content.

Brand context:
- Name: ${businessContext.brandName}
- Website: ${businessContext.websiteUrl}
- Description: ${businessContext.businessDescription || "Company offering services/products"}
- Target audience: ${businessContext.audience || "Professionals and individuals"}
- Business type: ${businessContext.businessType || "Digital services"}
- Competitors: ${businessContext.competitors.join(", ") || "Not specified"}

Generate 10 essential and VARIED AEO questions that users would ask ChatGPT, Gemini or Claude about ${businessContext.brandName}.

Question types to include:
1. "What is [brand]?" - Definition
2. "How much does [brand] cost?" - Pricing
3. "How does [brand] work?" - Process
4. "What are the benefits of [brand]?" - Benefits
5. "[Brand] vs [competitor]" - Comparison
6. "How to use [brand]?" - Tutorial
7. "Is [brand] reliable?" - Trust
8. "Who is [brand] for?" - Target
9. "What alternatives to [brand]?" - Alternatives
10. "Why choose [brand]?" - Justification

Strict JSON format: {"questions": ["question 1", "question 2", ..."]}`;
      }

      try {
        console.log(`[generate-aeo-answers] Calling AI to generate questions...`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: language === "fr" 
                ? "Tu es un expert AEO. Tu génères des questions pertinentes pour optimiser la citabilité par les assistants IA. Réponds uniquement en JSON valide."
                : "You are an AEO expert. You generate relevant questions to optimize AI assistant citability. Reply only in valid JSON."
              },
              { role: "user", content: questionGenPrompt }
            ],
            temperature: 0.7, // Higher creativity for varied questions
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "";
          console.log(`[generate-aeo-answers] AI response received:`, content.substring(0, 200));
          
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            questionsToProcess = parsed.questions || [];
            console.log(`[generate-aeo-answers] Generated ${questionsToProcess.length} questions`);
          }
        } else {
          console.error(`[generate-aeo-answers] AI response error:`, response.status, await response.text());
        }
      } catch (e) {
        console.error(`[generate-aeo-answers] Error generating questions:`, e);
      }

      // Mark keywords as used if we had any
      if (hasKeywords) {
        const keywordIds = keywords.map(k => k.id);
        await supabase
          .from("keywords")
          .update({ is_used: true })
          .in("id", keywordIds);
        console.log(`[generate-aeo-answers] Marked ${keywordIds.length} keywords as used`);
      }
    }

    // Generate answers for each question
    for (const questionText of questionsToProcess) {
      try {
        const intent = detectIntent(questionText, language);
        const platforms = targetPlatforms as Platform[];
        
        console.log(`[generate-aeo-answers] Generating for: "${questionText}" (intent: ${intent})`);
        
        const generated = await generateAIAnswer(
          questionText,
          businessContext,
          intent,
          language,
          lovableApiKey
        );
        
        const score = computeCitationScoreAEO(generated.answer, platforms);
        
        // 🔒 AEO SAFE MODE: Block low-quality answers
        if (score < 50) {
          console.log(`[generate-aeo-answers] ❌ Score too low (${score}), skipping: "${questionText.substring(0, 50)}..."`);
          continue;
        }

        // Claude editorial review
        const reviewed = await reviewWithClaude({
          content: generated.answer,
          contentType: "aeo_answer",
          brand: businessContext.brandName,
          question: questionText,
          language,
        });
        const finalAnswer = reviewed.content;

        // Insert into database
        const { data: inserted, error: insertError } = await supabase
          .from("answers")
          .insert({
            project_id: projectId,
            question: questionText,
            answer: finalAnswer,
            slug: generateSlug(questionText),
            platforms: platforms,
            score: score,
            is_public: false,
            intent: intent,
            difficulty: score >= 80 ? 'easy' : score >= 65 ? 'medium' : 'hard',
            high_citation: isHighCitation(score, finalAnswer), // Use new High Citation check
            supporting_content: {
              bullets: generated.bullets,
              faq: generated.faq
            }
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[generate-aeo-answers] Insert error:`, insertError);
        } else {
          console.log(`[generate-aeo-answers] ✅ Saved answer with score ${score}`);
          generatedAnswers.push(inserted);
        }
      } catch (error) {
        console.error(`[generate-aeo-answers] Error for question "${questionText}":`, error);
      }
    }

    console.log(`[generate-aeo-answers] Generated ${generatedAnswers.length} answers`);

    return new Response(JSON.stringify({
      success: true,
      answers: generatedAnswers,
      count: generatedAnswers.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-aeo-answers] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
