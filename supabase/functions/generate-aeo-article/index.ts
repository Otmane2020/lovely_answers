import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Escape HTML special characters to prevent XSS
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Generate AEO-optimized HTML article wrapper with proper SEO structure
function generateAEOArticleHTML(
  answer: {
    question: string;
    answer: string;
    supporting_content?: { bullets?: string[]; faq?: Array<{q: string; a: string}> };
  },
  articleContent: string,
  metaDescription: string,
  brandName: string,
  websiteUrl: string,
  language: string
): string {
  const faq = answer.supporting_content?.faq || [];
  
  // Build FAQ Schema
  const faqSchema = faq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.a
      }
    }))
  } : null;

  // Build Article Schema
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": answer.question,
    "description": metaDescription || answer.answer.slice(0, 160),
    "author": {
      "@type": "Organization",
      "name": brandName
    },
    "publisher": {
      "@type": "Organization",
      "name": brandName,
      "url": websiteUrl
    },
    "datePublished": new Date().toISOString(),
    "dateModified": new Date().toISOString()
  };

  const faqTitle = language === 'fr' ? 'Questions Fréquentes' : 'Frequently Asked Questions';

  const safeQuestion = escapeHtml(answer.question);
  const safeBrandName = escapeHtml(brandName);
  const safeWebsiteUrl = escapeHtml(websiteUrl);
  const safeMetaDesc = escapeHtml(metaDescription || answer.answer.slice(0, 160));

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeQuestion} | ${safeBrandName}</title>
  <meta name="description" content="${safeMetaDesc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${safeWebsiteUrl}">

  <!-- Open Graph -->
  <meta property="og:title" content="${safeQuestion}">
  <meta property="og:description" content="${safeMetaDesc}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${safeWebsiteUrl}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeQuestion}">
  <meta name="twitter:description" content="${safeMetaDesc}">
  
  <!-- Schema.org Article -->
  <script type="application/ld+json">
${JSON.stringify(articleSchema, null, 2)}
  </script>
  
  ${faqSchema ? `<!-- Schema.org FAQ -->
  <script type="application/ld+json">
${JSON.stringify(faqSchema, null, 2)}
  </script>` : ''}
  
  <style>
    :root {
      --primary: #7c3aed;
      --primary-light: #a78bfa;
      --bg: #ffffff;
      --surface: #f8fafc;
      --surface-alt: #f1f5f9;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --success: #10b981;
      --accent: #6366f1;
    }
    
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --surface: #1e293b;
        --surface-alt: #334155;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
        --border: #475569;
      }
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.8;
      font-size: 16px;
    }
    
    article {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    
    /* Typography Hierarchy */
    h1 {
      font-size: 2.25rem;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 1.5rem;
      color: var(--text);
      letter-spacing: -0.025em;
    }
    
    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1.3;
      margin-top: 2.5rem;
      margin-bottom: 1rem;
      color: var(--text);
      border-bottom: 2px solid var(--primary);
      padding-bottom: 0.5rem;
    }
    
    h3 {
      font-size: 1.25rem;
      font-weight: 600;
      line-height: 1.4;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      color: var(--text);
    }
    
    p {
      margin-bottom: 1.25rem;
      color: var(--text);
    }
    
    p.intro {
      font-size: 1.125rem;
      color: var(--text-muted);
      border-left: 4px solid var(--primary);
      padding-left: 1rem;
      margin-bottom: 2rem;
    }
    
    /* Lists */
    ul, ol {
      margin-bottom: 1.5rem;
      padding-left: 1.5rem;
    }
    
    li {
      margin-bottom: 0.75rem;
      padding-left: 0.5rem;
    }
    
    ul li::marker {
      color: var(--primary);
    }
    
    ol li::marker {
      color: var(--primary);
      font-weight: 600;
    }
    
    /* Text styling */
    strong {
      font-weight: 600;
      color: var(--text);
    }
    
    em {
      font-style: italic;
      color: var(--text-muted);
    }
    
    /* AEO Answer Box - Critical for AI citation */
    .aeo-answer {
      font-size: 1.15rem;
      line-height: 1.8;
      color: var(--text);
      background: var(--surface);
      border-left: 4px solid var(--primary);
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem;
      border-radius: 0 0.5rem 0.5rem 0;
    }
    
    .aeo-answer strong {
      color: var(--primary);
    }
    
    /* AEO Summary Box - Key benchmarks */
    .aeo-summary {
      background: var(--surface-alt);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      margin-bottom: 2rem;
    }
    
    .aeo-summary > p {
      margin-bottom: 0.75rem;
      font-weight: 600;
    }
    
    .aeo-summary ul {
      margin-bottom: 0;
    }
    
    .aeo-summary li {
      margin-bottom: 0.5rem;
    }
    
    .aeo-summary li:last-child {
      margin-bottom: 0;
    }
    
    /* AEO Featured Answer Box - Short answer recap */
    .aeo-featured-answer {
      background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
      border-radius: 1rem;
      padding: 1.5rem 2rem;
      margin: 2rem 0;
      box-shadow: 0 10px 40px -10px rgba(124, 58, 237, 0.3);
    }
    
    .aeo-featured-answer p {
      font-size: 1.125rem;
      color: white;
      font-weight: 500;
      margin: 0;
      line-height: 1.7;
    }
    
    /* FAQ Section */
    .faq-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 2rem;
      margin-top: 3rem;
    }
    
    .faq-section h2 {
      margin-top: 0;
      border-bottom: none;
      padding-bottom: 0;
    }
    
    .faq-item {
      border-bottom: 1px solid var(--border);
      padding: 1.25rem 0;
    }
    
    .faq-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    
    .faq-item h3 {
      margin-top: 0;
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
    }
    
    .faq-item p {
      margin-bottom: 0;
      color: var(--text-muted);
    }
    
    /* Footer */
    footer {
      text-align: center;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
      margin-top: 3rem;
    }
    
    footer p {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin: 0;
    }
    
    footer a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 500;
    }
    
    footer a:hover {
      text-decoration: underline;
    }
    
    /* Responsive */
    @media (max-width: 640px) {
      h1 { font-size: 1.75rem; }
      h2 { font-size: 1.25rem; }
      h3 { font-size: 1.1rem; }
      article { padding: 1.5rem 1rem; }
    }
  </style>
</head>
<body>
  <article itemscope itemtype="https://schema.org/Article">
    <header>
      <meta itemprop="datePublished" content="${new Date().toISOString()}">
      <meta itemprop="author" content="${safeBrandName}">
    </header>

    <!-- Main Article Content with SEO Structure -->
    <main itemprop="articleBody">
      ${articleContent}

      <!-- AEO Featured Answer Box -->
      <div class="aeo-featured-answer">
        <p><strong>En résumé :</strong> ${escapeHtml(answer.answer)}</p>
      </div>
    </main>

    ${faq.length > 0 ? `
    <!-- FAQ Section with Schema -->
    <section class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
      <h2>❓ ${faqTitle}</h2>
      ${faq.map(f => `
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <h3 itemprop="name">${escapeHtml(f.q)}</h3>
        <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
          <p itemprop="text">${escapeHtml(f.a)}</p>
        </div>
      </div>
      `).join('')}
    </section>
    ` : ''}

    <footer>
      <p>© ${new Date().getFullYear()} <a href="${safeWebsiteUrl}" target="_blank" rel="noopener">${safeBrandName}</a></p>
      <p style="margin-top: 0.75rem;"><a href="${safeWebsiteUrl}/blog" target="_blank" rel="noopener">${language === 'fr' ? '📚 Voir tous nos articles' : '📚 View all our articles'}</a></p>
    </footer>
  </article>
</body>
</html>`;
}

// Settings interface
interface ArticleSettings {
  articleLength: number;
  englishType: string;
  includeCitations: boolean;
  includeToc: boolean;
  includeSummary: boolean;
  includeInternalLinks: boolean;
  includeSchema: boolean;
  citationsRegion: string;
  specialInstructions: string;
  ctaLink: string;
  imageStyle: string;
  textOverlay: boolean;
  visualInstructions: string;
  includeYoutube: boolean;
  includeScreenshot: boolean;
  sitePages?: Array<{ url: string; title: string | null }>;
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
}

// Generate article content using OpenRouter AI with proper SEO structure and settings
async function generateArticleContentWithSettings(
  question: string,
  answer: string,
  context: BusinessContext,
  language: string,
  apiKey: string,
  settings: ArticleSettings
): Promise<{ content: string; meta_description: string; keywords: string[] }> {
  const { brandName, websiteUrl, businessDescription, audience, businessType, competitors, tone } = context;
  
  // Build dynamic instructions based on settings
  const wordRange = settings.articleLength <= 1500 ? "1000-1500" : 
                    settings.articleLength <= 2000 ? "1500-2000" : 
                    settings.articleLength <= 2500 ? "2000-2500" : "2500-3000";
  
  const tocInstruction = settings.includeToc ? 
    (language === 'fr' ? "Inclure une table des matières au début" : "Include a table of contents at the beginning") : "";
  
  const summaryInstruction = settings.includeSummary ? 
    (language === 'fr' ? "Inclure une section résumé" : "Include a summary section") : "";
  
  const schemaInstruction = settings.includeSchema ? 
    (language === 'fr' ? "Ajouter du Schema markup pour le SEO" : "Add Schema markup for SEO") : "";
  
  const ctaInstruction = settings.ctaLink ? 
    (language === 'fr' ? `Inclure un call-to-action vers: ${settings.ctaLink}` : `Include a call-to-action to: ${settings.ctaLink}`) : "";
  
  const specialInst = settings.specialInstructions ? 
    (language === 'fr' ? `Instructions spéciales: ${settings.specialInstructions}` : `Special instructions: ${settings.specialInstructions}`) : "";

  // Build internal linking instruction with actual URLs from sitemap
  let internalLinksInstruction = "";
  if (settings.includeInternalLinks && settings.sitePages && settings.sitePages.length > 0) {
    const pagesList = settings.sitePages
      .slice(0, 20) // Limit to 20 pages to keep prompt manageable
      .map(p => `- ${p.title || p.url}: ${p.url}`)
      .join("\n");
    
    internalLinksInstruction = language === 'fr'
      ? `\n\nMAILLAGE INTERNE OBLIGATOIRE:
Inclure 2-4 liens internes vers ces pages existantes du site. Utilise des ancres naturelles:
${pagesList}

Format: <a href="[URL]">[texte d'ancre naturel]</a>`
      : `\n\nREQUIRED INTERNAL LINKING:
Include 2-4 internal links to these existing site pages. Use natural anchor text:
${pagesList}

Format: <a href="[URL]">[natural anchor text]</a>`;
  }

  // Build business context section for prompts
  const businessContextFr = `
CONTEXTE BUSINESS (utilise ces informations pour personnaliser l'article):
- Marque: ${brandName}
- Site: ${websiteUrl}
${businessDescription ? `- Description: ${businessDescription}` : ""}
${audience ? `- Audience cible: ${audience}` : ""}
${businessType ? `- Type d'activité: ${businessType}` : ""}
${competitors?.length > 0 ? `- Concurrents à différencier: ${competitors.join(", ")}` : ""}
${tone ? `- Ton de voix: ${tone}` : ""}`;

  const businessContextEn = `
BUSINESS CONTEXT (use this information to personalize the article):
- Brand: ${brandName}
- Website: ${websiteUrl}
${businessDescription ? `- Description: ${businessDescription}` : ""}
${audience ? `- Target audience: ${audience}` : ""}
${businessType ? `- Business type: ${businessType}` : ""}
${competitors?.length > 0 ? `- Competitors to differentiate from: ${competitors.join(", ")}` : ""}
${tone ? `- Tone of voice: ${tone}` : ""}`;

  const systemPrompt = language === 'fr'
    ? `Tu es un expert en rédaction AEO (Answer Engine Optimization). Tu génères des articles optimisés pour être CITÉS par ChatGPT, Gemini, Perplexity et autres IA.
${businessContextFr}

RÈGLE D'OR AEO : "Répondre d'abord comme Wikipédia, puis parler comme une marque."

PRINCIPES AEO CRITIQUES:
1. LA RÉPONSE EN PREMIER : Les 2-3 premières phrases doivent contenir LA RÉPONSE DIRECTE à la question (chiffres, fourchettes, faits concrets)
2. NEUTRALITÉ D'ABORD : Pas de "Chez [marque], nous..." avant d'avoir donné la réponse factuelle
3. CITABILITÉ : Le premier paragraphe (60-90 mots max) doit être extractable tel quel par une IA
4. DONNÉES STRUCTURÉES : Utiliser des listes à puces pour les repères chiffrés
5. MARQUE APRÈS : La marque n'apparaît qu'APRÈS la réponse factuelle, en contexte

STRUCTURE HTML:
- Un seul H1 (reformulation de la question en titre)
- H2 pour les sections principales
- H3 pour les sous-sections
- <strong> pour les données clés (prix, pourcentages, dates)
- Listes à puces pour les repères extractables

PARAMÈTRES SPÉCIFIQUES:
- Longueur cible: ${wordRange} mots
- Type d'anglais: ${settings.englishType}
- Ton: ${tone || "Expert et factuel"}
${tocInstruction ? `- ${tocInstruction}` : ""}
${summaryInstruction ? `- ${summaryInstruction}` : ""}
${schemaInstruction ? `- ${schemaInstruction}` : ""}
${ctaInstruction ? `- ${ctaInstruction}` : ""}
${specialInst ? `- ${specialInst}` : ""}`
    : `You are an AEO (Answer Engine Optimization) writing expert. You generate articles optimized to be CITED by ChatGPT, Gemini, Perplexity and other AI assistants.
${businessContextEn}

GOLDEN AEO RULE: "Answer first like Wikipedia, then speak like a brand."

CRITICAL AEO PRINCIPLES:
1. ANSWER FIRST: The first 2-3 sentences must contain THE DIRECT ANSWER to the question (numbers, ranges, concrete facts)
2. NEUTRALITY FIRST: No "At [brand], we..." before giving the factual answer
3. CITABILITY: The first paragraph (60-90 words max) must be extractable as-is by an AI
4. STRUCTURED DATA: Use bullet lists for numerical benchmarks
5. BRAND AFTER: The brand only appears AFTER the factual answer, in context

HTML STRUCTURE:
- DO NOT include an H1 tag (title is rendered separately as a hero header by the editorial template)
- Start with a direct opening paragraph (gets a decorative drop cap)
- H2 for main sections
- H3 for subsections
- <strong> for key data (prices, percentages, dates)
- <blockquote> for at least one impactful pull-quote
- Bullet lists for extractable benchmarks

SPECIFIC SETTINGS:
- Target length: ${wordRange} words
- English type: ${settings.englishType}
- Tone: ${tone || "Expert and factual"}
${tocInstruction ? `- ${tocInstruction}` : ""}
${summaryInstruction ? `- ${summaryInstruction}` : ""}
${schemaInstruction ? `- ${schemaInstruction}` : ""}
${ctaInstruction ? `- ${ctaInstruction}` : ""}
${specialInst ? `- ${specialInst}` : ""}${internalLinksInstruction}`;

  const userPrompt = language === 'fr'
    ? `Génère un article AEO de ${wordRange} mots, optimisé pour être cité par les IA.

SUJET:
- Question: ${question}
- Réponse courte: ${answer}
- Marque: ${brandName}
${businessDescription ? `- Description activité: ${businessDescription}` : ""}
${audience ? `- Audience cible: ${audience}` : ""}

STRUCTURE AEO OBLIGATOIRE (en HTML propre):

${settings.includeToc ? `<!-- TABLE DES MATIÈRES -->
<nav class="toc">
<h2>Sommaire</h2>
<ul>
  <li><a href="#section1">[Titre section 1]</a></li>
  <li><a href="#section2">[Titre section 2]</a></li>
  <li><a href="#section3">[Titre section 3]</a></li>
</ul>
</nav>

` : ""}<!-- BLOC 1: RÉPONSE DIRECTE (CRITIQUE pour l'AEO) -->
<!-- PAS DE H1 : le titre est affiché séparément dans le template éditorial -->

<p class="aeo-answer"><strong>[RÉPONSE DIRECTE en 1-2 phrases avec les chiffres/faits clés]</strong>. [1-2 phrases de contexte factuel, SANS mentionner la marque].</p>

${settings.includeSummary ? `<div class="aeo-summary">
<p><strong>Repères clés :</strong></p>
<ul>
  <li><strong>[Fourchette basse]</strong> : [description courte et factuelle]</li>
  <li><strong>[Fourchette haute]</strong> : [description courte et factuelle]</li>
  <li><strong>[Critère important]</strong> : [explication factuelle]</li>
</ul>
</div>

` : ""}<!-- BLOC 2: DÉVELOPPEMENT (SEO + contexte) -->
<h2 id="section1">Comprendre [sujet principal]</h2>
<p>[Explication détaillée et pédagogique, 3-4 phrases]</p>
<p>[Contexte marché, tendances ou statistiques si pertinent]</p>

<blockquote>[Citation impactante ou insight clé sur le sujet - pour l'effet pull-quote éditorial]</blockquote>

<h2 id="section2">[Critères / Facteurs / Avantages]</h2>
<ul>
  <li><strong>[Point 1]</strong> : [Explication]</li>
  <li><strong>[Point 2]</strong> : [Explication]</li>
  <li><strong>[Point 3]</strong> : [Explication]</li>
</ul>

<hr>

<h2 id="section3">Comment [action/choix lié au sujet]</h2>
<p>[Méthode ou processus expliqué]</p>

<h3>Les étapes essentielles</h3>
<ol>
  <li>[Étape 1 avec détails]</li>
  <li>[Étape 2 avec détails]</li>
  <li>[Étape 3 avec détails]</li>
</ol>

<!-- BLOC 3: CONCLUSION avec marque -->
<h2>L'essentiel à retenir</h2>
<p>[Résumé factuel en 2-3 phrases]. Chez ${brandName}, [positionnement de la marque sur ce sujet, 1-2 phrases].</p>

${settings.ctaLink ? `<div class="cta-section">
<a href="${settings.ctaLink}" class="cta-button">En savoir plus</a>
</div>` : ""}

RÈGLES STRICTES:
1. NE PAS inclure de balise H1 - le titre est affiché séparément par le template éditorial
2. Le premier paragraphe (class="aeo-answer") DOIT contenir la réponse factuelle SANS mention de la marque
3. La marque ${brandName} n'apparaît QUE dans la conclusion
4. Tous les chiffres/prix/pourcentages doivent être en <strong>
5. Inclure au moins un <blockquote> pour l'effet pull-quote
6. Génère UNIQUEMENT le HTML du contenu (pas de <!DOCTYPE>, <html>, <head>, <body>)
7. L'article doit faire environ ${settings.articleLength} mots

Réponds en JSON:
{
  "content": "[HTML de l'article AEO complet - SANS H1]",
  "meta_description": "[Description meta de 150-160 caractères avec la réponse clé]",
  "keywords": ["mot-clé principal", "mot-clé secondaire 1", "mot-clé secondaire 2", "mot-clé secondaire 3"]
}`
    : `Generate a ${wordRange} word AEO article, optimized to be cited by AI assistants.

TOPIC:
- Question: ${question}
- Short answer: ${answer}
- Brand: ${brandName}

REQUIRED AEO STRUCTURE (in clean HTML):

${settings.includeToc ? `<!-- TABLE OF CONTENTS -->
<nav class="toc">
<h2>Contents</h2>
<ul>
  <li><a href="#section1">[Section 1 title]</a></li>
  <li><a href="#section2">[Section 2 title]</a></li>
  <li><a href="#section3">[Section 3 title]</a></li>
</ul>
</nav>

` : ""}<!-- BLOCK 1: DIRECT ANSWER (CRITICAL for AEO) -->
<!-- NO H1 TAG: the title is displayed separately by the editorial template as a hero header -->

<p class="aeo-answer"><strong>[DIRECT ANSWER in 1-2 sentences with key figures/facts]</strong>. [1-2 sentences of factual context, WITHOUT mentioning the brand].</p>

${settings.includeSummary ? `<div class="aeo-summary">
<p><strong>Key benchmarks:</strong></p>
<ul>
  <li><strong>[Low range]</strong>: [short factual description]</li>
  <li><strong>[High range]</strong>: [short factual description]</li>
  <li><strong>[Important criterion]</strong>: [factual explanation]</li>
</ul>
</div>

` : ""}<!-- BLOCK 2: DEVELOPMENT (SEO + context) -->
<h2 id="section1">Understanding [main topic]</h2>
<p>[Detailed pedagogical explanation, 3-4 sentences]</p>
<p>[Market context, trends or statistics if relevant]</p>

<blockquote>[Impactful insight or key quote about the topic - for editorial pull-quote effect]</blockquote>

<h2 id="section2">[Criteria / Factors / Benefits]</h2>
<ul>
  <li><strong>[Point 1]</strong>: [Explanation]</li>
  <li><strong>[Point 2]</strong>: [Explanation]</li>
  <li><strong>[Point 3]</strong>: [Explanation]</li>
</ul>

<hr>

<h2 id="section3">How to [action/choice related to topic]</h2>
<p>[Method or process explained]</p>

<h3>Essential steps</h3>
<ol>
  <li>[Step 1 with details]</li>
  <li>[Step 2 with details]</li>
  <li>[Step 3 with details]</li>
</ol>

<!-- BLOCK 3: CONCLUSION with brand -->
<h2>Key takeaways</h2>
<p>[Factual summary in 2-3 sentences]. At ${brandName}, [brand positioning on this topic, 1-2 sentences].</p>

${settings.ctaLink ? `<div class="cta-section">
<a href="${settings.ctaLink}" class="cta-button">Learn more</a>
</div>` : ""}

STRICT RULES:
1. DO NOT include any H1 tag - the title is rendered separately by the editorial template
2. The first paragraph (class="aeo-answer") MUST contain the factual answer WITHOUT brand mention
3. Brand ${brandName} only appears in the conclusion
4. All figures/prices/percentages must be in <strong>
5. Include at least one <blockquote> for the editorial pull-quote effect
6. Generate ONLY the HTML content (no <!DOCTYPE>, <html>, <head>, <body>)
7. Article should be approximately ${settings.articleLength} words

Reply in JSON:
{
  "content": "[Complete AEO article HTML - NO H1 TAG]",
  "meta_description": "[Meta description of 150-160 characters with the key answer]",
  "keywords": ["main keyword", "secondary keyword 1", "secondary keyword 2", "secondary keyword 3"]
}`;

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
      temperature: 0.55,
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  
  // NO FALLBACK - require strict JSON from the AI
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI did not return valid JSON for article");
  }
  try {
    return JSON.parse(match[0]) as { content: string; meta_description: string; keywords: string[] };
  } catch (e) {
    throw new Error(`AI returned malformed JSON for article: ${(e as Error).message}`);
  }
}


// Generate slug for articles
function generateArticleSlug(text: string): string {
  return text
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("OPENROUTER_API_KEY")!;
    
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's auth header for getClaims
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("[generate-aeo-article] Auth error:", claimsError);
      return new Response(JSON.stringify({ error: "Invalid JWT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    
    // Use service role client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { answerId, language = "fr" } = await req.json();

    console.log(`[generate-aeo-article] Generating article for answer: ${answerId}`);

    // Get the answer
    const { data: answer, error: answerError } = await supabase
      .from("answers")
      .select("*, projects(*)")
      .eq("id", answerId)
      .single();

    if (answerError || !answer) {
      return new Response(JSON.stringify({ error: "Answer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership
    if (answer.projects?.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brandName = answer.projects?.brand_name || answer.projects?.name || "Brand";
    const websiteUrl = answer.projects?.website_url || "";

    // Fetch generation settings for tone and additional context
    const { data: genSettings } = await supabase
      .from("generation_settings")
      .select("*")
      .eq("project_id", answer.project_id)
      .maybeSingle();

    // Build complete business context
    const businessContext: BusinessContext = {
      brandName,
      websiteUrl,
      businessDescription: genSettings?.business_description || answer.projects?.business_description || "",
      audience: (genSettings?.target_audiences?.join(", ") || answer.projects?.audience || ""),
      businessType: answer.projects?.business_type || "",
      competitors: genSettings?.competitors || answer.projects?.competitors || [],
      tone: genSettings?.tone || ""
    };

    console.log(`[generate-aeo-article] Business context loaded:`, {
      brandName: businessContext.brandName,
      hasDescription: !!businessContext.businessDescription,
      hasAudience: !!businessContext.audience,
      hasTone: !!businessContext.tone
    });

    // Load project settings for article generation
    const { data: projectSettings } = await supabase
      .from("project_settings")
      .select("*")
      .eq("project_id", answer.project_id)
      .maybeSingle();

    // Extract settings with defaults
    const settings = {
      articleLength: projectSettings?.article_length || 2000,
      englishType: projectSettings?.english_type || "American",
      includeCitations: projectSettings?.include_citations ?? true,
      includeToc: projectSettings?.include_toc ?? true,
      includeSummary: projectSettings?.include_summary ?? true,
      includeInternalLinks: projectSettings?.include_internal_links ?? true,
      includeSchema: projectSettings?.include_schema ?? false,
      citationsRegion: projectSettings?.citations_region || "Worldwide",
      specialInstructions: projectSettings?.special_instructions || "",
      ctaLink: projectSettings?.cta_link || "",
      imageStyle: projectSettings?.image_style || "photo",
      textOverlay: projectSettings?.text_overlay ?? true,
      visualInstructions: projectSettings?.visual_instructions || "",
      includeYoutube: projectSettings?.include_youtube ?? false,
      includeScreenshot: projectSettings?.include_screenshot ?? true,
      sitePages: [] as Array<{ url: string; title: string | null }>,
    };

    // Fetch site pages for internal linking if enabled
    if (settings.includeInternalLinks) {
      const { data: sitePages } = await supabase
        .from("site_pages")
        .select("url, title")
        .eq("project_id", answer.project_id)
        .limit(100);
      
      if (sitePages && sitePages.length > 0) {
        settings.sitePages = sitePages;
        console.log(`[generate-aeo-article] Found ${sitePages.length} site pages for internal linking`);
      }
    }

    console.log(`[generate-aeo-article] Using settings:`, { ...settings, sitePages: settings.sitePages.length });

    // Generate article content with settings and full business context
    const articleContent = await generateArticleContentWithSettings(
      answer.question,
      answer.answer,
      businessContext,
      language,
      lovableApiKey,
      settings
    );

    // Generate full HTML with proper SEO structure
    const fullHtml = generateAEOArticleHTML(
      {
        question: answer.question,
        answer: answer.answer,
        supporting_content: answer.supporting_content
      },
      articleContent.content,
      articleContent.meta_description,
      brandName,
      websiteUrl,
      language
    );

    // Create article in database
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .insert({
        project_id: answer.project_id,
        title: answer.question,
        slug: generateArticleSlug(answer.question),
        content: articleContent.content,
        html_content: fullHtml,
        meta_description: articleContent.meta_description,
        keywords: articleContent.keywords,
        status: "draft",
        aeo_score: answer.score
      })
      .select()
      .single();

    if (articleError) {
      console.error("[generate-aeo-article] Error creating article:", articleError);
      return new Response(JSON.stringify({ error: "Failed to create article" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Link article to answer
    await supabase
      .from("answers")
      .update({ article_id: article.id, has_article: true })
      .eq("id", answerId);

    console.log(`[generate-aeo-article] Created article ${article.id} for answer ${answerId}`);

    return new Response(JSON.stringify({
      success: true,
      article: article,
      html: fullHtml
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-aeo-article] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
