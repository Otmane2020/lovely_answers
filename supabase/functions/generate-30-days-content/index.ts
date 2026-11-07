import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reviewWithClaude } from "../_shared/claude-review.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IntentType = "price" | "duration" | "criteria" | "comparison" | "howto" | "best" | "what" | "why";

const INTENTS: IntentType[] = ["price", "criteria", "comparison", "howto", "best", "what", "why", "duration"];
type AIConfig = { lovableKey?: string | null; openrouterKey?: string | null };

function isAiCreditsError(message: string): boolean {
  return /\b402\b|payment_required|insufficient credits|not enough credits/i.test(message);
}

async function callAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  ai: AIConfig,
  opts: { temperature?: number; max_tokens?: number; response_format?: { type: "json_object" } } = {}
): Promise<{ content: string; provider: string; finishReason?: string }> {
  const temperature = opts.temperature ?? 0.5;
  const max_tokens = opts.max_tokens ?? 4000;
  const body = {
    model: "google/gemini-3-flash-preview",
    messages,
    temperature,
    max_tokens,
    ...(opts.response_format ? { response_format: opts.response_format } : {}),
  };

  const errors: string[] = [];
  if (ai.lovableKey) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": ai.lovableKey,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      const content = data?.choices?.[0]?.message?.content ?? "";
      if (res.ok && content) {
        return { content, provider: "Lovable AI", finishReason: data?.choices?.[0]?.finish_reason };
      }
      errors.push(`Lovable AI ${res.status}: ${JSON.stringify(data?.error || data).slice(0, 300)}`);
    } catch (e) {
      errors.push(`Lovable AI error: ${(e as Error).message || e}`);
    }
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    try {
      const system = messages.find((m) => m.role === "system")?.content || "";
      const anthropicMessages = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens,
          temperature,
          system: `${system}\nReturn only valid JSON that matches the requested schema.`,
          messages: anthropicMessages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const content = data?.content?.find((part: any) => part?.type === "text")?.text ?? "";
      if (res.ok && content) {
        return { content, provider: "Anthropic", finishReason: data?.stop_reason };
      }
      errors.push(`Anthropic ${res.status}: ${JSON.stringify(data?.error || data).slice(0, 300)}`);
    } catch (e) {
      errors.push(`Anthropic error: ${(e as Error).message || e}`);
    }
  }

  if (ai.openrouterKey) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ai.openrouterKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...body, model: "google/gemini-2.5-flash" }),
      });
      const data = await res.json().catch(() => ({}));
      const content = data?.choices?.[0]?.message?.content ?? "";
      if (res.ok && content) {
        return { content, provider: "OpenRouter", finishReason: data?.choices?.[0]?.finish_reason };
      }
      errors.push(`OpenRouter ${res.status}: ${JSON.stringify(data?.error || data).slice(0, 300)}`);
    } catch (e) {
      errors.push(`OpenRouter error: ${(e as Error).message || e}`);
    }
  }

  throw new Error(errors.length ? errors.join(" | ") : "No AI provider configured");
}

// Map project_settings.publish_frequency → set of valid weekday numbers (0=Sun..6=Sat).
// "monthly" is handled separately via getDate()===1 and never consults this set.
function getPublishDaysSet(frequency: string): Set<number> {
  switch (frequency) {
    case "daily":   return new Set([0, 1, 2, 3, 4, 5, 6]);
    case "weekly":  return new Set([1]);            // Monday
    case "2x_week": return new Set([2, 4]);         // Tue/Thu
    case "monthly": return new Set();               // unused — branch short-circuits on getDate()===1
    case "3x_week":
    default:        return new Set([1, 3, 5]);      // Mon/Wed/Fri
  }
}

// ==================== SAFE JSON PARSING ====================
function safeParseJSON<T = unknown>(str: string): T {
  // Strategy 1: Direct parse
  try { 
    return JSON.parse(str); 
  } catch (e) {
    console.log("[safeParseJSON] Strategy 1 failed, trying cleanup...");
  }
  
  // Strategy 2: Remove control characters
  let cleaned = str.replace(/[\x00-\x1F\x7F]/g, " ");
  try { 
    return JSON.parse(cleaned); 
  } catch (e) {
    console.log("[safeParseJSON] Strategy 2 failed...");
  }
  
  // Strategy 3: Fix newlines inside string values - more aggressive
  cleaned = cleaned
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, " ");
  try { 
    return JSON.parse(cleaned); 
  } catch (e) {
    console.log("[safeParseJSON] Strategy 3 failed...");
  }
  
  // Strategy 4: Remove trailing commas and fix common issues
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/\\'/g, "'")
    .replace(/"\s*\n\s*"/g, '", "');
  try { 
    return JSON.parse(cleaned); 
  } catch (e) {
    console.log("[safeParseJSON] Strategy 4 failed...");
  }
  
  // Strategy 5: Extract just the JSON object/array
  const objectMatch = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
  if (objectMatch) {
    try { 
      return JSON.parse(objectMatch[0]); 
    } catch (e) {
      console.log("[safeParseJSON] Strategy 5 failed...");
    }
  }
  
  // Strategy 6: Last resort - try to extract key fields manually
  console.log("[safeParseJSON] All strategies failed, attempting manual extraction...");
  try {
    const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/);
    const contentMatch = cleaned.match(/"content"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"meta|"\s*})/);
    const metaMatch = cleaned.match(/"metaDescription"\s*:\s*"([^"]+)"/);
    
    if (titleMatch || contentMatch) {
      return {
        title: titleMatch?.[1] || "Article",
        content: contentMatch?.[1]?.replace(/\\n/g, "\n") || "",
        metaDescription: metaMatch?.[1] || "",
      };
    }
  } catch (e) {
    console.log("[safeParseJSON] Manual extraction failed");
  }
  
  throw new Error("Failed to parse JSON after all strategies");
}

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
  const jitter = answer.length % 12; // 0-11 variation
  let score = 52 + jitter; // base 52-63
  const currentYear = new Date().getFullYear();

  // Temporal context
  if (answer.includes(String(currentYear)) || answer.includes(String(currentYear + 1))) score += 5;

  // Data points / numbers
  if (/\d+\s*(€|\$|%|euros?|dollars?|mois|jours?|ans?|années?)/i.test(answer)) score += 4;
  else if (/\d+/.test(answer)) score += 2;

  // Criteria / actionable signals
  if (/crit[eè]re|choisir|éviter|erreur|condition|attention|important/i.test(answer)) score += 4;
  if (/[:\-•]|\d\.\s/.test(answer)) score += 3;

  // Word count
  const wordCount = answer.split(/\s+/).length;
  if (wordCount >= 80 && wordCount <= 150) score += 3;
  if (wordCount < 40) score -= 8;
  else if (wordCount < 60) score -= 4;

  // Brand mention
  if (new RegExp(escapeRegex(brand), "i").test(answer)) score += 3;

  // Comparison / structured content
  if (/contrairement|par rapport|différen|versus|tandis que/i.test(answer)) score += 3;

  // Penalty for generic definitions
  if (/^(un|une|le|la|les|l')\s+\w+\s+(est|sont|désigne)/i.test(answer)) score -= 6;
  if (!/[.!?]/.test(answer)) score -= 6;
  if (!/[:\-•]|\d\.\s/.test(answer) && wordCount > 30) score -= 3;

  return Math.min(100, Math.max(45, score));
}

function ensureQuestionMark(text: string): string {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return trimmed;
  return trimmed.replace(/[.!,;:]$/, "") + " ?";
}

function isValidQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 15) return false;
  const questionPatterns = [
    /^(comment|how|what|quel|quelle|quels|quelles|pourquoi|why|when|quand|où|where|combien|how much|how many)/i,
    /\?$/,
    /(est-ce que|is it|are there|y a-t-il|peut-on|can we|should|faut-il)/i,
  ];
  return questionPatterns.some(p => p.test(trimmed));
}

// Generate questions - SIMPLIFIED prompt for better JSON
async function generateQuestions(
  brandName: string,
  description: string,
  language: string,
  ai: AIConfig,
  count: number = 5,
  keywords: string[] = []
): Promise<{ question: string; intent: IntentType }[]> {
  const currentYear = new Date().getFullYear();
  
  // Simplified prompt - ask for clean JSON
  const prompt = language === "fr"
    ? `Génère ${count} questions décisionnelles uniques pour ${brandName}.

Règles:
- Chaque question finit par "?"
- Questions orientées décision (Comment choisir, Quel budget, Quelles erreurs éviter)
- Ne pas utiliser le nom "${brandName}" dans les questions
- Contexte ${currentYear}
${keywords && keywords.length > 0 ? `\nMots-clés SEO du projet à UTILISER comme base pour les questions:\n${keywords.join(", ")}\n\nTransforme ces mots-clés en questions naturelles et décisionnelles.` : ""}

Exemples:
- "Comment choisir un mobilier écoresponsable de qualité ?"
- "Quel budget prévoir pour des meubles design ?"

Retourne UNIQUEMENT ce JSON (pas de markdown, pas de code block):
{"questions":[{"question":"...?","intent":"criteria|price|howto|comparison|why|best"}]}`
    : `Generate ${count} unique decision-oriented questions for ${brandName}.

Rules:
- Each question ends with "?"
- Decision-oriented (How to choose, What budget, What mistakes to avoid)
- Don't use "${brandName}" in questions
- ${currentYear} context
${keywords && keywords.length > 0 ? `\nProject SEO keywords to USE as the basis for questions:\n${keywords.join(", ")}\n\nTransform these keywords into natural, decision-oriented questions.` : ""}

Return ONLY this JSON (no markdown, no code block):
{"questions":[{"question":"...?","intent":"criteria|price|howto|comparison|why|best"}]}`;

  try {
    const { content, provider, finishReason } = await callAI([
      { role: "system", content: "You output ONLY valid JSON. No markdown, no code blocks, no prose." },
      { role: "user", content: `${prompt}\n\nBusiness: ${brandName}\nDescription: ${description}` },
    ], ai, {
      temperature: 0.7,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    });

    console.log(`[generateQuestions] provider=${provider}, finish_reason=${finishReason}, content length=${content.length}`);

    if (!content) throw new Error(`Empty AI response from ${provider} (finish_reason=${finishReason})`);

    let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const jsonStart = cleaned.search(/[\{\[]/);
    const jsonEnd = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`No JSON in response. finish_reason=${finishReason}, preview=${content.slice(0, 200)}`);
    }
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

    const parsed = safeParseJSON<any>(cleaned);
    
    // Post-process questions
    const validQuestions = (parsed.questions || [])
      .slice(0, count)
      .map((q: any) => {
        let question = q.question || q;
        
        if (typeof question !== "string") {
          question = `Comment choisir ${brandName} en ${currentYear} ?`;
        }
        
        if (!isValidQuestion(question)) {
          question = language === "fr"
            ? `Comment choisir ${question} adapté à ses besoins en ${currentYear} ?`
            : `How to choose ${question} suited to your needs in ${currentYear}?`;
        }
        
        question = ensureQuestionMark(question);
        
        return {
          question,
          intent: INTENTS.includes(q.intent) ? q.intent : detectIntent(question),
        };
      });
    
    console.log(`[generateQuestions] Generated ${validQuestions.length} valid questions`);
    return validQuestions;
  } catch (e) {
    console.error("[generateQuestions] Failed:", e);
    // NO FALLBACK - AI must succeed to produce real content for Google & AI assistants
    throw new Error(`AI question generation failed: ${(e as Error).message || e}`);
  }
}


// Generate answer - AEO-OPTIMIZED prompt for LLM citation
async function generateAnswer(
  question: string,
  brandName: string,
  description: string,
  intent: IntentType,
  language: string,
  ai: AIConfig,
  retryCount: number = 0
): Promise<{ answer: string; bullets: string[]; faq: { q: string; a: string }[] }> {

  // AEO-optimized prompt following best practices for AI citation
  const prompt = language === "fr"
    ? `Tu es un expert AEO. Génère une réponse RICHE et CITABLE par ChatGPT, Gemini, Perplexity.

Question: "${question}"
Contexte métier: ${description}
Marque: ${brandName}

⚠️ RÈGLES AEO:
1. Réponse de 4-5 phrases (100-150 mots), directe ET détaillée
2. AUCUN pourcentage sans source crédible
3. Ton NEUTRE et expert (pas "nous recommandons")
4. Langage FACTUEL avec chiffres, critères, délais, conditions
5. Structure EXTRACTABLE avec au moins un chiffre ou fourchette

FORMAT OBLIGATOIRE:
- Phrase 1: Réponse directe avec critère chiffré
- Phrase 2: Contexte temporel (${new Date().getFullYear()}) ou condition importante
- Phrase 3: Erreur fréquente à éviter OU comparaison utile
- Phrase 4-5: Nuance ou conseil expert additionnel
- Points clés: 4 critères précis et mesurables
- FAQ: 2-3 questions connexes avec réponses de 30-50 mots

✅ AUTORISÉ: Mentionner "${brandName}" UNE fois avec URL si pertinent

Retourne UNIQUEMENT ce JSON:
{"answer":"réponse 4-5 phrases riches...","bullets":["Critère 1 avec donnée précise","Critère 2 avec exemple concret","Critère 3 erreur à éviter","Critère 4 conseil expert"],"faq":[{"q":"question connexe précise?","a":"réponse 30-50 mots factuelle"},{"q":"question alternative ou comparaison?","a":"réponse 30-50 mots"},{"q":"question sur les erreurs?","a":"réponse 30-50 mots pratique"}]}`
    : `You are an AEO expert. Generate a RICH and CITABLE response for ChatGPT, Gemini, Perplexity.

Question: "${question}"
Business context: ${description}
Brand: ${brandName}

⚠️ AEO RULES:
1. Answer of 4-5 sentences (100-150 words), direct AND detailed
2. NO unsourced percentages
3. NEUTRAL expert tone (not "we recommend")
4. FACTUAL language with numbers, criteria, timelines, conditions
5. EXTRACTABLE structure with at least one number or range

MANDATORY FORMAT:
- Sentence 1: Direct answer with numbered criterion
- Sentence 2: Temporal context (${new Date().getFullYear()}) or important condition
- Sentence 3: Common mistake to avoid OR useful comparison
- Sentences 4-5: Nuance or additional expert advice
- Key points: 4 precise and measurable criteria
- FAQ: 2-3 related questions with 30-50 word answers

✅ ALLOWED: Mention "${brandName}" ONCE with URL if relevant

Return ONLY this JSON:
{"answer":"rich 4-5 sentence response...","bullets":["Criterion 1 with precise data","Criterion 2 with concrete example","Criterion 3 mistake to avoid","Criterion 4 expert tip"],"faq":[{"q":"precise related question?","a":"30-50 word factual answer"},{"q":"alternative or comparison question?","a":"30-50 word answer"},{"q":"question about mistakes?","a":"30-50 word practical answer"}]}`;

  try {
    const { content, provider, finishReason } = await callAI([
      { role: "system", content: "You output ONLY valid JSON. No markdown, no code blocks, no prose." },
      { role: "user", content: prompt },
    ], ai, {
      temperature: 0.5,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    console.log(`[generateAnswer] provider=${provider}, finish_reason=${finishReason}, content length=${content.length}`);
    const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON found in ${provider} response. finish_reason=${finishReason}, preview=${content.slice(0, 200)}`);

    const parsed = safeParseJSON<any>(match[0]);

    return {
      answer: parsed.answer || `${brandName} propose des solutions adaptées à ce besoin.`,
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 4) : [],
      faq: Array.isArray(parsed.faq) ? parsed.faq.slice(0, 3) : [],
    };
  } catch (e) {
    console.error(`[generateAnswer] Failed (retry ${retryCount}):`, e);

    // Retry once with simpler prompt
    if (retryCount < 1) {
      console.log("[generateAnswer] Retrying with simpler prompt...");
      await new Promise(r => setTimeout(r, 500));
      return generateAnswer(question, brandName, description, intent, language, ai, retryCount + 1);
    }

    // NO FALLBACK - AI must succeed. Throw so the caller skips this item entirely
    // instead of polluting the blog with generic template content.
    throw new Error(`AI answer generation failed for question "${question}": ${(e as Error).message || e}`);
  }
}


// Convert content to clean HTML - handles both HTML and markdown input
function convertToCleanHTML(content: string): string {
  // If content already looks like HTML (has tags), clean it up
  if (/<(h[1-6]|p|ul|ol|li|div|section|article|strong|em)\b/i.test(content)) {
    // Already HTML - just clean up any markdown artifacts
    let html = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    return html;
  }
  
  // Content is markdown - convert to HTML properly
  const lines = content.split('\n');
  let html = '';
  let inList = false;
  let listType = '';
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      if (inList) {
        html += listType === 'ul' ? '</ul>\n' : '</ol>\n';
        inList = false;
      }
      continue;
    }
    
    // Headers
    if (line.startsWith('### ')) {
      if (inList) { html += listType === 'ul' ? '</ul>\n' : '</ol>\n'; inList = false; }
      html += `<h3>${line.slice(4).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</h3>\n`;
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html += listType === 'ul' ? '</ul>\n' : '</ol>\n'; inList = false; }
      html += `<h2>${line.slice(3).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</h2>\n`;
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { html += listType === 'ul' ? '</ul>\n' : '</ol>\n'; inList = false; }
      // Skip H1 - title is rendered separately by editorial template
      continue;
    }
    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      if (inList) { html += listType === 'ul' ? '</ul>\n' : '</ol>\n'; inList = false; }
      html += '<hr>\n';
      continue;
    }
    // Blockquote
    if (line.startsWith('> ')) {
      if (inList) { html += listType === 'ul' ? '</ul>\n' : '</ol>\n'; inList = false; }
      const quoteContent = line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<blockquote>${quoteContent}</blockquote>\n`;
      continue;
    }
    
    // Unordered list items
    if (/^[-*•]\s+/.test(line)) {
      const itemContent = line.replace(/^[-*•]\s+/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
      if (!inList || listType !== 'ul') {
        if (inList) html += listType === 'ul' ? '</ul>\n' : '</ol>\n';
        html += '<ul>\n';
        inList = true;
        listType = 'ul';
      }
      html += `  <li>${itemContent}</li>\n`;
      continue;
    }
    
    // Ordered list items
    if (/^\d+[.)]\s+/.test(line)) {
      const itemContent = line.replace(/^\d+[.)]\s+/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
      if (!inList || listType !== 'ol') {
        if (inList) html += listType === 'ul' ? '</ul>\n' : '</ol>\n';
        html += '<ol>\n';
        inList = true;
        listType = 'ol';
      }
      html += `  <li>${itemContent}</li>\n`;
      continue;
    }
    
    // Regular paragraph
    if (inList) {
      html += listType === 'ul' ? '</ul>\n' : '</ol>\n';
      inList = false;
    }
    
    // Apply inline formatting
    line = line
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    html += `<p>${line}</p>\n`;
  }
  
  // Close any open list
  if (inList) {
    html += listType === 'ul' ? '</ul>\n' : '</ol>\n';
  }
  
  return html;
}

// Generate article - AEO-OPTIMIZED for LLM citation
async function generateArticle(
  question: string,
  answer: string,
  bullets: string[],
  faq: { q: string; a: string }[],
  brandName: string,
  description: string,
  language: string,
  ai: AIConfig,
  retryCount: number = 0
): Promise<{ title: string; content: string; htmlContent: string; metaDescription: string; wordCount: number }> {
  const currentYear = new Date().getFullYear();

  // AEO-optimized article prompt
  const prompt = language === "fr"
    ? `Tu es un expert AEO. Écris un article PILIER COMPLET, RICHE et citable par les IA.

Question source: ${question}
Réponse AEO: ${answer}
Points clés: ${bullets.join(" | ")}
Contexte métier: ${description}
Marque: ${brandName}

⚠️ RÈGLES AEO ARTICLE:
1. Titre: Question reformulée + année ${currentYear} si pertinent (≤ 70 caractères)
2. Introduction (classe "aeo-answer"): Réponse directe de 60-90 mots avec chiffres clés (citable telle quelle)
3. Corps: 4-5 sections H2 avec contenu RICHE et extractable
4. Chaque section H2: commence par 1-2 phrases de réponse directe + développement
5. Au moins 1 liste numérotée (étapes ou critères) et 1 liste à puces
6. Section "Erreurs fréquentes" ou "À éviter" obligatoire
7. Conclusion factuelle en 2-3 phrases

❌ INTERDIT:
- Ton commercial ("nous vous proposons")
- Paragraphes de plus de 4 phrases
- Vague sans critères précis

✅ FORMAT HTML OBLIGATOIRE (TEMPLATE EDITORIAL):
- HTML pur, PAS de markdown
- PAS de <h1> (titre affiché séparément dans le template)
- Commencer par <p class="aeo-answer"><strong>[réponse directe avec chiffre clé]</strong>. [contexte factuel]</p>
- <h2> pour les sections (4-5 sections minimum)
- <h3> pour les sous-sections
- <strong> pour les données clés (prix, délais, critères chiffrés)
- <blockquote> pour au moins 2 insights importants (pull-quotes)
- <ul><li> et <ol><li> pour les listes
- <hr> entre les sections majeures
- <div class="aeo-summary"><p><strong>Points clés:</strong></p><ul>...</ul></div> pour un encadré récapitulatif
- 800-1200 mots (article complet et riche)

Retourne UNIQUEMENT ce JSON (HTML pur dans content):
{"title":"Titre clair avec question en ${currentYear}","content":"<p class=\\"aeo-answer\\"><strong>Réponse directe...</strong>...</p><div class=\\"aeo-summary\\">...</div><h2>Section 1</h2><p>...</p><blockquote>...</blockquote><h2>Section 2</h2><p>...</p><ol><li>...</li></ol><hr><h2>Section 3</h2>...<h2>Erreurs à éviter</h2><ul><li>...</li></ul><h2>Conclusion</h2><p>...</p>","metaDescription":"Description 150-160 chars avec réponse clé et chiffre"}`
    : `You are an AEO expert. Write a COMPLETE, RICH pillar article citable by AI.

Source question: ${question}
AEO answer: ${answer}
Key points: ${bullets.join(" | ")}
Business context: ${description}
Brand: ${brandName}

⚠️ AEO ARTICLE RULES:
1. Title: Reformulated question + year ${currentYear} if relevant (≤ 70 chars)
2. Introduction (class "aeo-answer"): Direct answer of 60-90 words with key figures (citable as-is)
3. Body: 4-5 H2 sections with RICH, extractable content
4. Each H2 section: opens with 1-2 direct answer sentences + development
5. At least 1 numbered list (steps or criteria) and 1 bullet list
6. "Common Mistakes" or "What to Avoid" section required
7. Factual conclusion in 2-3 sentences

❌ FORBIDDEN:
- Commercial tone ("we offer you")
- Paragraphs longer than 4 sentences
- Vague without precise criteria

✅ MANDATORY HTML FORMAT (EDITORIAL TEMPLATE):
- Pure HTML, NO markdown
- NO <h1> (title displayed separately in template)
- Start with <p class="aeo-answer"><strong>[direct answer with key number]</strong>. [factual context]</p>
- <h2> for sections (4-5 minimum)
- <h3> for subsections
- <strong> for key data (prices, deadlines, numbered criteria)
- <blockquote> for at least 2 important insights (pull-quotes)
- <ul><li> and <ol><li> for lists
- <hr> between major sections
- <div class="aeo-summary"><p><strong>Key takeaways:</strong></p><ul>...</ul></div> for a summary box
- 800-1200 words (complete rich article)

Return ONLY this JSON (pure HTML in content):
{"title":"Clear title with question in ${currentYear}","content":"<p class=\\"aeo-answer\\"><strong>Direct answer...</strong>...</p><div class=\\"aeo-summary\\">...</div><h2>Section 1</h2><p>...</p><blockquote>...</blockquote><h2>Section 2</h2><p>...</p><ol><li>...</li></ol><hr><h2>Section 3</h2>...<h2>Common Mistakes</h2><ul><li>...</li></ul><h2>Conclusion</h2><p>...</p>","metaDescription":"150-160 char description with key answer and number"}`;

  try {
    const { content, provider, finishReason } = await callAI([
      { role: "system", content: "You output ONLY valid JSON. No markdown, no code blocks, no prose." },
      { role: "user", content: prompt },
    ], ai, {
      temperature: 0.55,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    });

    console.log(`[generateArticle] provider=${provider}, finish_reason=${finishReason}, content length=${content.length}`);

    // Try to extract JSON from code blocks first
    let jsonStr = "";
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) jsonStr = match[0];
    }
    
    if (!jsonStr) {
      throw new Error("No JSON found in response");
    }
    
    const parsed = safeParseJSON(jsonStr);
    
    const articleContent = parsed.content || answer;
    const wordCount = articleContent.split(/\s+/).length;

    // Convert content to proper HTML - handle both HTML and markdown responses
    let htmlContent = convertToCleanHTML(articleContent);

    // Add FAQ section
    if (faq.length > 0) {
      const faqHtml = `
<section class="faq-section">
  <h2>${language === 'fr' ? 'Questions Fréquentes' : 'FAQ'}</h2>
  ${faq.map(f => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('\n')}
</section>`;
      htmlContent += faqHtml;
    }

    return {
      title: parsed.title || question,
      content: articleContent,
      htmlContent,
      metaDescription: (parsed.metaDescription || answer.substring(0, 155)).slice(0, 155),
      wordCount,
    };
  } catch (e) {
    console.error(`[generateArticle] Failed (retry ${retryCount}):`, e);
    
    // Retry once with even simpler prompt
    if (retryCount < 1) {
      console.log("[generateArticle] Retrying with ultra-simple prompt...");
      await new Promise(r => setTimeout(r, 500));
      return generateArticle(question, answer, bullets, faq, brandName, description, language, ai, retryCount + 1);
    }
    
    // NO FALLBACK - if AI fails to write the magazine-format article, throw.
    // We never publish stitched-together placeholders.
    throw new Error(`AI article generation failed for "${question}": ${(e as Error).message || e}`);

  }
}

// ==================== MAIN HANDLER ====================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ai: AIConfig = {
      lovableKey: Deno.env.get("LOVABLE_API_KEY"),
      openrouterKey: Deno.env.get("OPENROUTER_API_KEY"),
    };
    if (!ai.lovableKey && !ai.openrouterKey) throw new Error("No AI provider configured");

    const auth = req.headers.get("authorization");
    if (!auth) throw new Error("Missing auth header");

    const token = auth.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = token === serviceRoleKey;

    let userId: string | null = null;
    if (!isServiceRole) {
      // Use anon-key client for JWT validation to avoid service-role auth issues
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) throw new Error("Invalid token");
      userId = claimsData.claims.sub as string;
    }

    const body = await req.json();
    // CHANGED: overwrite = false by default to prevent deleting existing content
    // questionsPerDay = 1 means 1 question generates 1 answer + 1 article = 2 items per day
    // Language is now fetched from project/generation_settings, not body - default is "en"
    const { projectId, days = 5, overwrite = false, startOffset = 0, questionsPerDay = 1, titlesOnly = false } = body;
    let language = body.language || null; // Will be overridden by project settings if not provided

    console.log(`[generate-30-days] Request params: projectId=${projectId}, userId=${userId}, days=${days}`);

    if (!projectId) throw new Error("Missing projectId");

    // Long-running work runs in background to avoid 150s edge timeout.
    // Client should poll planning/answers/articles tables for progress.
    const backgroundWork = (async () => {
      try {


    // Get project - service role bypasses user_id check
    let project: any = null;
    if (isServiceRole) {
      const { data: projectData } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      project = projectData;
    } else {
      const { data: projectData } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .eq("user_id", userId!)
        .single();
      project = projectData;

      // If not found with user_id, check if user is a team member
      if (!project) {
        console.log(`[generate-30-days] Project not found for owner, checking team membership...`);
        
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("project_id, role")
          .eq("project_id", projectId)
          .eq("user_id", userId!)
          .eq("status", "accepted")
          .single();
        
        if (teamMember) {
          console.log(`[generate-30-days] User is team member with role: ${teamMember.role}`);
          const { data: pd } = await supabase
            .from("projects")
            .select("*")
            .eq("id", projectId)
            .single();
          project = pd;
        }
      }
    }

    if (!project) {
      console.error(`[generate-30-days] Project not found: projectId=${projectId}`);
      throw new Error("Project not found");
    }

    const brandName = project.brand_name || project.name;
    const description = project.business_description || "";
    
    // CRITICAL: Get language from project settings - DO NOT default to French
    // Priority: 1. body.language (explicit override) -> 2. project.language -> 3. "en" (default)
    if (!language) {
      // Try to get language from generation_settings first (more reliable)
      const { data: genSettings } = await supabase
        .from("generation_settings")
        .select("language")
        .eq("project_id", projectId)
        .maybeSingle();
      
      language = genSettings?.language || project.language || "en";
    }
    
    console.log(`[generate-30-days] Using language: ${language} (project.language=${project.language})`);


    console.log(`[generate-30-days] Starting for project: ${project.name}, ${days} days (offset: ${startOffset}), overwrite=${overwrite}, questionsPerDay=${questionsPerDay}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Apply startOffset to support batch processing
    const startDate = new Date(today.getTime() + startOffset * 86400000);
    const endDate = new Date(startDate.getTime() + days * 86400000);

    // MODE OVERWRITE
    if (overwrite) {
      console.log(`[generate-30-days] OVERWRITE MODE: Deleting scheduled items from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // 1. Unlink articles from answers
      await supabase
        .from("answers")
        .update({ article_id: null, has_article: false })
        .eq("project_id", projectId)
        .gte("scheduled_date", startDate.toISOString())
        .lt("scheduled_date", endDate.toISOString());
      
      // 2. Delete articles
      const { count: deletedArticles } = await supabase
        .from("articles")
        .delete({ count: "exact" })
        .eq("project_id", projectId)
        .gte("scheduled_date", startDate.toISOString())
        .lt("scheduled_date", endDate.toISOString());
      
      console.log(`[generate-30-days] Deleted ${deletedArticles} articles`);
      
      // 3. Delete answers
      const { count: deletedAnswers } = await supabase
        .from("answers")
        .delete({ count: "exact" })
        .eq("project_id", projectId)
        .gte("scheduled_date", startDate.toISOString())
        .lt("scheduled_date", endDate.toISOString());
      
      console.log(`[generate-30-days] Deleted ${deletedAnswers} answers`);
      
      // 4. Clear planning entries for this range
      await supabase
        .from("planning")
        .update({ answer_id: null, article_id: null })
        .eq("project_id", projectId)
        .gte("day", startDate.toISOString().split('T')[0])
        .lt("day", endDate.toISOString().split('T')[0]);
    }

    // Fetch project keywords to inject into question generation
    const { data: projectKeywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("project_id", projectId)
      .eq("is_used", false)
      .limit(30);

    const keywordList = (projectKeywords || []).map((k: any) => k.keyword);
    console.log(`[generate-30-days] Found ${keywordList.length} unused keywords for question generation`);

    // Honor project_settings.publish_frequency (daily / 3x_week / 2x_week / weekly / monthly).
    const { data: psRow } = await supabase
      .from("project_settings")
      .select("publish_frequency")
      .eq("project_id", projectId)
      .maybeSingle();
    const publishFrequency: string = (psRow as any)?.publish_frequency || "3x_week";
    const PUBLISH_DAYS = getPublishDaysSet(publishFrequency);
    console.log(`[generate-30-days] publish_frequency=${publishFrequency} → days=${[...PUBLISH_DAYS].join(",")}`);

    // Build list of valid publish dates from startDate
    const publishDates: Date[] = [];
    const maxLookahead = Math.max(days * 4, 60);
    for (let offset = 0; publishDates.length < days && offset < maxLookahead; offset++) {
      const d = new Date(startDate.getTime() + offset * 86400000);
      if (publishFrequency === "monthly") {
        if (d.getDate() === 1) publishDates.push(d);
      } else if (PUBLISH_DAYS.has(d.getDay())) {
        publishDates.push(d);
      }
    }

    // Generate questions — 3 posts per week (Mon/Wed/Fri), so ~13 posts per 30 days
    const totalQuestions = publishDates.length * questionsPerDay;
    console.log(`[generate-30-days] Generating ${totalQuestions} questions (${questionsPerDay} per publish day for ${publishDates.length} publish days)...`);
    const questions = await generateQuestions(brandName, description, language, ai, totalQuestions, keywordList);
    console.log(`[generate-30-days] Generated ${questions.length} questions`);

    const answersCreated: any[] = [];
    const articlesCreated: any[] = [];

    // Process each question - 1 question per publish day
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const dayIndex = Math.floor(i / questionsPerDay);
      if (dayIndex >= publishDates.length) break;
      const scheduledDate = publishDates[dayIndex];
      const scheduledDateStr = scheduledDate.toISOString();
      const dayStr = scheduledDateStr.split('T')[0];

      console.log(`[generate-30-days] Processing ${i + 1}/${questions.length}: ${q.question.substring(0, 40)}... (day ${dayIndex + 1})`);

      try {
        // Fetch existing content for this day
        const { data: dayAnswers } = await supabase
          .from("answers")
          .select("id, question, answer, supporting_content, article_id, has_article, score, created_at")
          .eq("project_id", projectId)
          .gte("scheduled_date", dayStr)
          .lt("scheduled_date", new Date(scheduledDate.getTime() + 86400000).toISOString().split('T')[0])
          .order("created_at", { ascending: true });

        const { data: dayArticles } = await supabase
          .from("articles")
          .select("id, linked_answer_id, created_at")
          .eq("project_id", projectId)
          .gte("scheduled_date", dayStr)
          .lt("scheduled_date", new Date(scheduledDate.getTime() + 86400000).toISOString().split('T')[0])
          .order("created_at", { ascending: true });

        const answersCount = dayAnswers?.length || 0;
        const articlesCount = dayArticles?.length || 0;

        // If day already has 1 answer + 1 article, ensure planning_days is synced, then skip generation
        if (answersCount >= 1 && articlesCount >= 1) {
          const existingAnswer = (dayAnswers || [])[0];
          const existingArticle =
            (dayArticles || []).find((a: any) => a.linked_answer_id === existingAnswer.id) || (dayArticles || [])[0];

          if (existingAnswer?.id && existingArticle?.id) {
            const { error: syncError } = await supabase
              .from("planning_days")
              .upsert(
                {
                  project_id: projectId,
                  scheduled_date: dayStr,
                  answer_id: existingAnswer.id,
                  article_id: existingArticle.id,
                },
                { onConflict: "project_id,scheduled_date" }
              );

            if (syncError) {
              console.error(`[generate-30-days] Error syncing planning_days for existing day ${dayStr}:`, syncError);
            } else {
              console.log(`[generate-30-days] Synced planning_days for existing day ${dayStr}`);
            }

            // Also ensure answer is linked
            if (!existingAnswer.article_id || existingAnswer.article_id !== existingArticle.id) {
              await supabase
                .from("answers")
                .update({ article_id: existingArticle.id, has_article: true })
                .eq("id", existingAnswer.id);
            }
          }

          console.log(`[generate-30-days] Day ${dayStr} already has answer+article, skipping generation...`);
          continue;
        }

        // If answer exists but article missing, generate ONLY the article for the existing answer
        if (answersCount >= 1 && articlesCount === 0) {
          const existingAnswer = (dayAnswers || []).find((a: any) => !a.article_id) || (dayAnswers || [])[0];
          if (!existingAnswer) {
            console.log(`[generate-30-days] Day ${dayStr} has answersCount=${answersCount} but no usable answer found, continuing normal flow...`);
          } else {
            console.log(`[generate-30-days] Day ${dayStr} has an answer but no article; generating article for existing answer ${existingAnswer.id}`);

            const supporting = (existingAnswer.supporting_content || {}) as any;
            const bullets = Array.isArray(supporting.bullets) ? supporting.bullets : [];
            const faq = Array.isArray(supporting.faq) ? supporting.faq : [];

            const articleData = await generateArticle(
              existingAnswer.question,
              existingAnswer.answer,
              bullets,
              faq,
              brandName,
              description,
              language,
              ai
            );

            // ── Claude review ──
            if (articleData.htmlContent) {
              const reviewed = await reviewWithClaude({
                content: articleData.htmlContent,
                contentType: "article",
                language,
                brand: brandName,
                topic: existingAnswer.question,
              });
              articleData.htmlContent = reviewed.content;
              articleData.content = reviewed.content;
            }

            const score = typeof existingAnswer.score === "number"
              ? existingAnswer.score
              : computeScore(existingAnswer.answer, brandName);

            const { data: insertedArticle, error: articleError } = await supabase
              .from("articles")
              .insert({
                project_id: projectId,
                linked_answer_id: existingAnswer.id,
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

            if (articleError) {
              console.error(`[generate-30-days] Error inserting article for existing answer:`, articleError);
              continue;
            }

            articlesCreated.push(insertedArticle);
            console.log(`[generate-30-days] Article created for existing answer: ${insertedArticle.id}`);

            // Link back to answer
            await supabase
              .from("answers")
              .update({ article_id: insertedArticle.id, has_article: true })
              .eq("id", existingAnswer.id);

            // Update planning_days (with NOT NULL constraints)
            const { error: planningError } = await supabase
              .from("planning_days")
              .upsert({
                project_id: projectId,
                scheduled_date: dayStr,
                answer_id: existingAnswer.id,
                article_id: insertedArticle.id,
              }, {
                onConflict: "project_id,scheduled_date",
              });

            if (planningError) {
              console.error(`[generate-30-days] Error upserting planning_days (existing answer):`, planningError);
            } else {
              console.log(`[generate-30-days] planning_days updated for ${dayStr} (existing answer)`);
            }

            // Done for this day
            continue;
          }
        }

        // Otherwise: generate a NEW answer (and article)
        let answerData: { answer: string; bullets: string[]; faq: { q: string; a: string }[] };
        let score: number;

        if (titlesOnly) {
          // TITLES-ONLY MODE: create placeholder entries without AI content generation
          answerData = {
            answer: "",
            bullets: [],
            faq: [],
          };
          score = 0;
        } else {
          answerData = await generateAnswer(q.question, brandName, description, q.intent, language, ai);
          score = computeScore(answerData.answer, brandName);
        }

        // ── Claude review (post-generation polish) ──
        if (answerData.answer && !titlesOnly) {
          const reviewed = await reviewWithClaude({
            content: answerData.answer,
            contentType: "aeo_answer",
            language,
            brand: brandName,
            question: q.question,
          });
          answerData.answer = reviewed.content;
        }

        // Insert answer
        const { data: insertedAnswer, error: answerError } = await supabase
          .from("answers")
          .insert({
            project_id: projectId,
            question: q.question,
            answer: answerData.answer || "Content locked — subscribe to unlock.",
            slug: generateSlug(q.question),
            intent: q.intent,
            score,
            is_public: false,
            scheduled_date: scheduledDateStr,
            supporting_content: {
              bullets: answerData.bullets,
              faq: answerData.faq,
            },
          })
          .select()
          .single();

        if (answerError) {
          console.error(`[generate-30-days] Error inserting answer:`, answerError);
          continue;
        }

        answersCreated.push(insertedAnswer);
        console.log(`[generate-30-days] Answer created: ${insertedAnswer.id}`);

        // Generate article (or placeholder in titlesOnly mode)
        let articleData: { title: string; content: string; htmlContent: string; metaDescription: string; wordCount: number };

        if (titlesOnly) {
          // Create title from question
          const titleFromQuestion = q.question.replace(/\?$/, "").trim();
          articleData = {
            title: titleFromQuestion,
            content: "",
            htmlContent: "",
            metaDescription: "",
            wordCount: 0,
          };
        } else {
          articleData = await generateArticle(
            q.question, answerData.answer, answerData.bullets, answerData.faq,
            brandName, description, language, ai
          );

          // ── Claude review (article post-generation polish) ──
          if (articleData.htmlContent) {
            const reviewed = await reviewWithClaude({
              content: articleData.htmlContent,
              contentType: "article",
              language,
              brand: brandName,
              topic: q.question,
            });
            articleData.htmlContent = reviewed.content;
            articleData.content = reviewed.content;
          }
        }

        // Insert article

        const { data: insertedArticle, error: articleError } = await supabase
          .from("articles")
          .insert({
            project_id: projectId,
            linked_answer_id: insertedAnswer.id,
            title: articleData.title,
            content: articleData.content || null,
            html_content: articleData.htmlContent || null,
            meta_description: articleData.metaDescription || null,
            word_count: articleData.wordCount,
            slug: generateSlug(articleData.title),
            status: titlesOnly ? "locked" : "scheduled",
            scheduled_date: scheduledDateStr,
            aeo_score: score,
          })
          .select()
          .single();

        if (articleError) {
          console.error(`[generate-30-days] Error inserting article:`, articleError);
        } else {
          articlesCreated.push(insertedArticle);
          console.log(`[generate-30-days] Article created: ${insertedArticle.id}`);

          // Update answer with article reference
          await supabase
            .from("answers")
            .update({ article_id: insertedArticle.id, has_article: true })
            .eq("id", insertedAnswer.id);
        }

        // Update planning_days table (with NOT NULL constraints - only insert if we have both)
        if (insertedArticle?.id) {
          const { error: planningError } = await supabase
            .from("planning_days")
            .upsert({
              project_id: projectId,
              scheduled_date: dayStr,
              answer_id: insertedAnswer.id,
              article_id: insertedArticle.id,
            }, {
              onConflict: "project_id,scheduled_date",
            });

          if (planningError) {
            console.error(`[generate-30-days] Error upserting planning_days:`, planningError);
          } else {
            console.log(`[generate-30-days] planning_days updated for ${dayStr}`);
          }
        }

        // Small delay to avoid rate limits
        if (i < questions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (err) {
        console.error(`[generate-30-days] Error processing question ${i + 1}:`, err);
      }
    }

        console.log(`[generate-30-days] Completed: ${answersCreated.length} answers, ${articlesCreated.length} articles`);
      } catch (bgErr: any) {
        console.error("[generate-30-days] Background error:", bgErr?.message || bgErr);
      }
    })();

    // @ts-ignore - EdgeRuntime is available in Supabase Edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundWork);
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: "processing",
        message: "Generation started in background. Poll your planning/answers/articles to track progress.",
        days_requested: days,
        start_offset: startOffset,
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[generate-30-days] Error:", e);
    const message = e?.message || String(e);
    const creditsError = isAiCreditsError(message);
    return new Response(
      JSON.stringify({
        success: false,
        code: creditsError ? "AI_CREDITS_EXHAUSTED" : "GENERATION_FAILED",
        error: creditsError
          ? "AI credits are exhausted. No content was generated. Add AI credits or update an available provider key, then retry."
          : message,
      }),
      { status: creditsError ? 402 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

