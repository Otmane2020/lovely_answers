/**
 * Claude content review & rewrite helper.
 *
 * Used by all content generators (AEO, GEO, Local, Shopping, Articles) to
 * pass freshly-generated content through Claude before it is persisted.
 * Claude polishes structure, fixes grammar/formatting issues, enforces the
 * project's editorial rules, and returns the rewritten version.
 *
 * If the review fails for any reason (missing key, API error, timeout) we
 * fall back to the original content so generation never breaks.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";
const REVIEW_TIMEOUT_MS = 45_000;

export type ReviewableContentType =
  | "aeo_answer"      // Short Q&A answer (markdown/plain)
  | "geo_content"     // Long-form GEO content (markdown/HTML)
  | "local_answer"    // Local AEO Q&A
  | "shopping_qa"     // E-commerce product Q&A
  | "article"         // Long blog article (HTML)
  | "article_markdown"; // Long blog article (markdown)

export interface ReviewInput {
  content: string;
  contentType: ReviewableContentType;
  language?: string;
  brand?: string;
  topic?: string;
  question?: string;
  extraRules?: string;
}

export interface ReviewResult {
  content: string;
  reviewed: boolean;
  reason?: string;
}

function buildSystemPrompt(input: ReviewInput): string {
  const lang = input.language || "en";
  const brand = input.brand || "the brand";
  const typeRules: Record<ReviewableContentType, string> = {
    aeo_answer: `Concise direct answer (50-120 words). Use H3 only if needed. Lists OK. No H1, no H2. Mention "${brand}" naturally once if relevant.`,
    geo_content: `Long-form GEO content. Use H2/H3 structure, short paragraphs, bullet lists, quotes. NO H1. Mention "${brand}" 2-4 times naturally.`,
    local_answer: `Local Q&A answer (80-150 words). Mention the city/area if present. H3 only. Practical, actionable.`,
    shopping_qa: `Product Q&A. Direct, factual, 60-120 words. Cover usage / tech / purchase angle as relevant. No fluff.`,
    article: `Long blog article in HTML. Use <h2>/<h3>, <p>, <ul>, <ol>, <blockquote>. Never include <h1>, <html>, <head>, <body>, <!DOCTYPE>. 800-1500 words. Mention "${brand}" 3-5 times naturally.`,
    article_markdown: `Long blog article in markdown. Use ## / ###, paragraphs, lists, quotes. NO # H1. 800-1500 words. Mention "${brand}" 3-5 times naturally.`,
  };

  return [
    `You are a senior editorial reviewer for AI-Search (AEO/GEO) content.`,
    `Your job: take the draft below and return a polished, publication-ready version in ${lang === "fr" ? "French" : lang === "es" ? "Spanish" : lang === "de" ? "German" : lang === "it" ? "Italian" : "English"}.`,
    ``,
    `Rules for this content type:`,
    typeRules[input.contentType],
    ``,
    `Global rules:`,
    `- Fix grammar, typos, awkward phrasing.`,
    `- Improve structure (subheads, paragraphs, lists) for readability and AI-search extractability.`,
    `- Remove any meta-commentary, "as an AI" disclaimers, "here is the answer:" preambles.`,
    `- Remove duplicate sentences, filler, marketing fluff.`,
    `- Keep facts, numbers, names exactly as in the draft. Do NOT invent.`,
    `- Keep the same language as the draft (${lang}).`,
    `- Preserve the original format: if the draft is HTML, return HTML; if markdown, return markdown; if plain text, return plain text.`,
    input.extraRules ? `\nExtra project rules:\n${input.extraRules}` : ``,
    ``,
    `Output ONLY the rewritten content. No JSON wrapper, no "Here is the revised version:", no code fences, no explanation.`,
  ].filter(Boolean).join("\n");
}

function buildUserPrompt(input: ReviewInput): string {
  const ctx: string[] = [];
  if (input.topic) ctx.push(`Topic: ${input.topic}`);
  if (input.question) ctx.push(`Question: ${input.question}`);
  if (input.brand) ctx.push(`Brand: ${input.brand}`);
  const ctxBlock = ctx.length ? `\nContext:\n${ctx.join("\n")}\n` : "";
  return `${ctxBlock}\nDraft to review and rewrite:\n---\n${input.content}\n---`;
}

/**
 * Run Claude on a piece of generated content. Always returns a string —
 * falls back to the original on any failure so the caller can persist safely.
 */
export async function reviewWithClaude(input: ReviewInput): Promise<ReviewResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return { content: input.content, reviewed: false, reason: "missing_key" };
  }
  if (!input.content || input.content.trim().length < 20) {
    return { content: input.content, reviewed: false, reason: "too_short" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        temperature: 0.3,
        system: buildSystemPrompt(input),
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[claude-review] HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return { content: input.content, reviewed: false, reason: `http_${res.status}` };
    }

    const data = await res.json();
    const rewritten = data?.content?.[0]?.text?.trim();
    if (!rewritten || rewritten.length < 20) {
      return { content: input.content, reviewed: false, reason: "empty_response" };
    }

    // Strip accidental code fences if Claude wrapped output
    const cleaned = rewritten
      .replace(/^```(?:html|markdown|md|text)?\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    console.log(`[claude-review] reviewed ${input.contentType} (${input.content.length} → ${cleaned.length} chars)`);
    return { content: cleaned, reviewed: true };
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[claude-review] error:`, (err as Error)?.message || err);
    return { content: input.content, reviewed: false, reason: "exception" };
  }
}
