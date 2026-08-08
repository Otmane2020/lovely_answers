import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 🔒 PATCH 1 — Reddit-banned SEO/AEO terms (will get you downvoted)
const REDDIT_BANNED_TERMS = [
  "AEO",
  "Answer Engine",
  "SEO automation",
  "optimize for AI",
  "AI answers",
  "citation",
  "search optimization",
  "AI-powered",
  "machine learning optimization",
  "LLM optimization"
];

/* =======================
   🔥 VERTICAL FILTER ENGINE (MULTI-SECTOR)
   Generic business filtering for all sectors
======================= */

// 🔒 PATCH 1 — Define all business verticals
type Vertical = 
  | "furniture" 
  | "tech" 
  | "ecommerce" 
  | "finance" 
  | "freelance" 
  | "marketing" 
  | "general";

// 🔒 PATCH 2 — Keyword patterns for each vertical (EXPANDED for better matching)
const VERTICAL_KEYWORDS: Record<Vertical, RegExp> = {
  // Furniture: expanded with common Reddit terms (appartement, emménagement, premier appart)
  furniture: /meuble|mobilier|canapé|sofa|table|chaise|fauteuil|lit|matelas|buffet|armoire|étagère|dressing|salon|chambre|salle à manger|déco|décoration|interior|interieur|home|design|marbre|bois|rangement|aménag|furniture|couch|desk|chair|bedroom|living room|home office|ikea|maison du monde|conforama|cuisine|salle de bain|miroir|bureau|appartement|studio|emménag|déménag|premier appart|logement|location meublé|ameublement|rideau|tapis|luminaire|lampe|bibliothèque|commode|tiroir|placard|penderie|avis.*meuble|conseil.*déco|acheter.*meuble|où trouver.*meuble/i,
  tech: /saas|software|api|startup|app|code|dev|ai|cloud|mvp|développeur|developer|programmer|logiciel|algorithme|machine learning|intelligence artificielle|github|tech|infrastructure|backend|frontend|fullstack|database|serveur|hosting|no-code|nocode|lowcode|automatisation|workflow|integration|webhook/i,
  ecommerce: /ecommerce|e-commerce|shopify|boutique|vente|retail|dropshipping|amazon|marketplace|woocommerce|magento|prestashop|panier|checkout|livraison|expédition|stock|inventaire|produit|catalogue|conversion|tunnel de vente|paiement en ligne/i,
  finance: /finance|investissement|bourse|crypto|épargne|budget|argent|trading|actions|portefeuille|banque|crédit|prêt|immobilier|assurance|impôt|fiscalité|patrimoine|placement|rendement|dividende|pea|assurance vie|scpi|etf|obligations/i,
  freelance: /freelance|client|mission|facturation|tjm|contrat|indépendant|consultant|prestataire|agence|agency|devis|proposition|portfolio|tarif|honoraires|auto-entrepreneur|micro-entreprise|portage salarial|urssaf/i,
  marketing: /seo|marketing|ads|publicité|growth|leads|acquisition|conversion|funnel|campagne|audience|ciblage|analytics|trafic|content|social media|influenceur|branding|notoriété|référencement|google ads|facebook ads|linkedin ads/i,
  general: /.*/i
};

// 🔒 PATCH 3 — Forbidden subreddits by vertical
// ⚠️ IMPORTANT: We allow generic subs (france, AskFrance, vosfinances) IF the post matches the vertical keywords
// Only truly irrelevant subs are forbidden (politics, city-specific, pure news)
const FORBIDDEN_SUBS_BY_VERTICAL: Record<Vertical, string[]> = {
  furniture: ["politique", "actualite", "Lyon", "Toulouse", "Bordeaux", "Marseille", "Nantes", "Strasbourg", "news", "worldnews", "europe"],
  tech: ["politique", "actualite", "news", "worldnews"],
  ecommerce: ["politique", "actualite", "news", "worldnews"],
  finance: ["politique", "actualite", "news", "worldnews"],
  freelance: ["politique", "actualite", "news"],
  marketing: ["politique", "actualite", "news"],
  general: ["politique", "news", "worldnews"]
};

// 🔒 PATCH 4 — Detect vertical from project context
function detectVertical(context: { businessType?: string; businessDescription: string }): Vertical {
  const text = `${context.businessType || ""} ${context.businessDescription}`.toLowerCase();

  if (/meuble|mobilier|furniture|canapé|sofa|déco|interior|home|décoration|ameublement/.test(text)) {
    return "furniture";
  }
  if (/saas|software|app|startup|api|tech|logiciel|développement|code|mvp/.test(text)) {
    return "tech";
  }
  if (/ecommerce|e-commerce|shop|boutique|vente|retail|shopify|marketplace/.test(text)) {
    return "ecommerce";
  }
  if (/finance|investissement|argent|bourse|crypto|épargne|trading|banque/.test(text)) {
    return "finance";
  }
  if (/freelance|agency|agence|consultant|indépendant|prestataire/.test(text)) {
    return "freelance";
  }
  if (/seo|marketing|growth|ads|traffic|acquisition|leads|publicité/.test(text)) {
    return "marketing";
  }

  return "general";
}

// 🔒 PATCH 5 — Check if post matches the detected vertical (FALLBACK only)
function isPostRelevantToVertical(post: RealRedditPost, vertical: Vertical): boolean {
  if (vertical === "general") return true;
  
  const text = `${post.title} ${post.body}`.toLowerCase();
  return VERTICAL_KEYWORDS[vertical].test(text);
}

// 🔥 NEW: KEYWORD-FIRST FILTER — Use project keywords as primary filter
// This is MUCH more accurate than vertical-based filtering
const STOP_WORDS = new Set([
  // French (common words that don't add meaning)
  "pour", "avec", "dans", "comment", "quel", "quelle", "quels", "quelles",
  "faire", "avoir", "être", "etre", "cette", "votre", "notre", "leur",
  "très", "tres", "plus", "moins", "bien", "sont", "suis", "êtes", "etes",
  "france", "près", "chez", "vous",
  // English
  "what", "which", "where", "when", "best", "good", "find", "have", "make",
  "your", "their", "this", "that", "with", "from", "about", "more", "less",
  "very", "some", "most", "than", "been", "being", "would", "should", "could"
]);

/* =======================
   🔥 PATCH: STRICT FURNITURE FILTERING (OBJECT + CONTEXT)
   Posts MUST contain a furniture object to be relevant
======================= */
const FURNITURE_OBJECTS = {
  fr: /\b(meuble|canapé|sofa|table|chaise|fauteuil|lit\b|matelas|armoire|buffet|étagère|bureau|commode|bibliothèque|miroir|tapis|luminaire|dressing|rangement|penderie|placard|tiroir|tabouret|banquette|console|vitrine|secrétaire|vaisselier|bahut|desserte|guéridon|pouf|méridienne|ottomane|coffre|patère|porte-manteau|sommier|cadre de lit|table basse|table de chevet|chevet|tv meuble|meuble tv)\b/i,
  en: /\b(furniture|couch|sofa|table|chair|armchair|bed\b|mattress|wardrobe|dresser|shelf|desk|cabinet|bookshelf|mirror|rug|lamp|closet|drawer|stool|bench|console|nightstand|sideboard|ottoman|recliner|loveseat|futon|credenza|vanity|hutch|tv stand|coffee table|end table|dining table)\b/i
};

const MARKETPLACE_CONTEXT = {
  fr: /vend(?:re|s|u|eur)?|achet(?:er|é|eur)?|occasion|seconde main|d'occasion|leboncoin|marketplace|annonce|don(?:ne|s)?|troc|récupèr|débarrass|cherche\s+(un|une|des)|où\s+(trouver|acheter)|prix|budget|pas cher|gratuit|récup|brocante|vide.?grenier|emmaus|ikea|conforama|maisons? du monde/i,
  en: /sell(?:ing)?|buy(?:ing)?|used|secondhand|second hand|marketplace|thrift|flip(?:ping)?|giv(?:e|ing)\s+away|looking for|where to\s+(find|buy|get)|price|budget|cheap|free|deal|garage sale|estate sale|craigslist|facebook marketplace|offerup|ikea|wayfair/i
};

// 🔥 FURNITURE VERTICAL: Check if post is about FURNITURE specifically
function isPostRelevantForFurniture(
  post: RealRedditPost,
  language: string = "fr"
): { relevant: boolean; hasFurnitureObject: boolean; hasMarketplaceContext: boolean } {
  const text = `${post.title} ${post.body || ""}`.toLowerCase();
  const objectPattern = language === "fr" ? FURNITURE_OBJECTS.fr : FURNITURE_OBJECTS.en;
  const contextPattern = language === "fr" ? MARKETPLACE_CONTEXT.fr : MARKETPLACE_CONTEXT.en;
  
  const hasFurnitureObject = objectPattern.test(text);
  const hasMarketplaceContext = contextPattern.test(text);
  
  // MUST contain a furniture object to be relevant for furniture vertical
  return { 
    relevant: hasFurnitureObject, 
    hasFurnitureObject,
    hasMarketplaceContext 
  };
}

function isPostRelevantToProject(
  post: RealRedditPost,
  projectKeywords: string[],
  language: string = "fr",
  vertical: Vertical = "general"
): boolean {
  const combinedText = `${post.title} ${post.body || ""}`.toLowerCase();
  
  // 🔥 FURNITURE VERTICAL: STRICT CHECK - MUST contain furniture object
  if (vertical === "furniture") {
    const furnitureCheck = isPostRelevantForFurniture(post, language);
    if (!furnitureCheck.hasFurnitureObject) {
      console.log(`[reddit-agent] ✗ Rejected (no furniture object): "${post.title.substring(0, 50)}..."`);
      return false;
    }
    console.log(`[reddit-agent] ✓ Furniture object found (context: ${furnitureCheck.hasMarketplaceContext}): "${post.title.substring(0, 40)}..."`);
    return true;
  }
  
  // 2. For other verticals: Extract significant terms from project keywords
  const keywordTerms = new Set<string>();
  projectKeywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    kwLower.split(/\s+/).forEach(term => {
      const normalized = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (term.length > 3 && !STOP_WORDS.has(term)) {
        keywordTerms.add(term);
        keywordTerms.add(normalized);
      }
    });
  });
  
  // 3. Check if post contains any keyword term
  const combinedNormalized = combinedText.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  for (const term of keywordTerms) {
    if (combinedText.includes(term) || combinedNormalized.includes(term)) {
      console.log(`[reddit-agent] ✓ Keyword match "${term}" in: "${post.title.substring(0, 40)}..."`);
      return true;
    }
  }
  
  return false;
}

function sanitizeRedditReply(text: string): string {
  let clean = text;
  REDDIT_BANNED_TERMS.forEach(term => {
    clean = clean.replace(new RegExp(term, "gi"), "");
  });
  // Clean up double spaces and trim
  return clean.replace(/\s+/g, " ").trim();
}

// Normalize Reddit title to AEO question
function normalizeToAeoQuestion(title: string): string {
  let question = title.trim();
  // Remove common Reddit prefixes
  question = question.replace(/^\[.*?\]\s*/g, "");
  question = question.replace(/^(ELI5|TIL|TIFU|CMV|AITA|WIBTA)[:.\s]*/gi, "");
  // Ensure it ends with a question mark if it's a question
  if (/^(what|why|how|when|where|who|which|can|does|do|is|are|should|would|could)/i.test(question) && !question.endsWith("?")) {
    question += "?";
  }
  return question;
}

interface RedditRequest {
  projectId?: string;
  action: "find-opportunities" | "generate-responses" | "analyze-subreddits" | "aeo-reply";
  subreddits?: string[];
  keywords?: string[];
  // Language and business context
  language?: string;
  business_description?: string;
  target_audiences?: string[];
  // For aeo-reply action
  title?: string;
  body?: string;
  subreddit?: string;
  mention_brand?: boolean;
  include_link?: boolean;
  tone?: "expert_human" | "casual" | "professional";
  brand_name?: string;
  brand_url?: string;
  save_as_aeo?: boolean;
}

interface RedditOpportunity {
  subreddit: string;
  postTitle: string;
  postUrl: string;
  relevanceScore: number;
  suggestedResponse: string;
  engagementPotential: "high" | "medium" | "low";
  postAge: string;
}

// 🔥 NEW: Fetch REAL Reddit posts using RSS feed (more reliable than JSON API)
interface RealRedditPost {
  id: string;
  title: string;
  body: string;
  subreddit: string;
  url: string;
  score: number;
  comments: number;
  createdUtc: number;
  relevanceScore?: number;
  relevanceReason?: string;
  trendScore?: number;
  intent?: string;
}

/* =======================
   🔥 AMÉLIORATION 1: TREND SCORE
   Score de tendance basé sur engagement + récence
======================= */
function computeTrendScore(post: RealRedditPost): number {
  const now = Math.floor(Date.now() / 1000);
  const ageInHours = Math.max(1, (now - post.createdUtc) / 3600);
  
  // Recency weight: posts < 6h get boost, decay after
  const recencyWeight = ageInHours <= 6 ? 1.0 : 
                        ageInHours <= 24 ? 0.8 : 
                        ageInHours <= 72 ? 0.5 : 0.3;
  
  // Engagement metrics (score = upvotes, comments = discussions)
  const engagementScore = 
    (post.score || 0) * 0.5 + 
    (post.comments || 0) * 0.3;
  
  // Normalize: base 50, engagement adds up to 40, recency adds up to 10
  const trendScore = Math.min(100, Math.round(
    50 + 
    Math.min(40, engagementScore / 5) + 
    recencyWeight * 10
  ));
  
  return trendScore;
}

/* =======================
   🔥 AMÉLIORATION 2: INTENT DETECTION
   Détection de l'intention pour AEO
======================= */
type QuestionIntent = "howto" | "best" | "why" | "price" | "comparison" | "criteria" | "what";

function detectIntent(title: string, language: string): QuestionIntent {
  const titleLower = title.toLowerCase();
  
  if (language === "fr") {
    if (/^(comment|tutoriel|étapes?|guide|faire|créer|configurer|installer|réaliser)/i.test(titleLower)) return "howto";
    if ((/meilleur|top|recommand|conseill|quel.*choisir|où (acheter|trouver)/i.test(titleLower))) return "best";
    if (/pourquoi|raison|cause|explique/i.test(titleLower)) return "why";
    if (/prix|coût|budget|combien|tarif|pas cher|moins cher|économi/i.test(titleLower)) return "price";
    if (/vs\b|versus|ou\b.*ou\b|comparaison|compare|différence|mieux.*entre/i.test(titleLower)) return "comparison";
    if (/critères?|choisir|comment savoir|quoi (prendre|choisir)|à considérer/i.test(titleLower)) return "criteria";
  } else {
    if (/^(how to|tutorial|steps?|guide|create|build|make|set up|install)/i.test(titleLower)) return "howto";
    if (/best|top|recommend|suggest|which.*should|where to (buy|find)|looking for/i.test(titleLower)) return "best";
    if (/why|reason|cause|explain/i.test(titleLower)) return "why";
    if (/price|cost|budget|how much|afford|cheap|expensive|worth/i.test(titleLower)) return "price";
    if (/vs\b|versus|or\b.*or\b|comparison|compare|difference|better.*between/i.test(titleLower)) return "comparison";
    if (/criteria|choose|how to know|what to (look for|consider)|factors/i.test(titleLower)) return "criteria";
  }
  
  return "what";
}

/* =======================
   🔥 AMÉLIORATION 3: ANSWER-READY JSON
   Structure prête pour publication AEO
======================= */
interface AnswerReadyJSON {
  slug: string;
  question: string;
  short_answer: string;
  long_answer: string;
  sources: string[];
  trend_score: number;
  relevance_score: number;
  intent: QuestionIntent;
  language: string;
  status: "draft" | "pending" | "published";
  metadata: {
    reddit_url: string;
    subreddit: string;
    original_title: string;
    detected_at: string;
  };
}

function createAnswerReadyJSON(
  post: RealRedditPost, 
  language: string,
  brandName: string
): AnswerReadyJSON {
  const intent = detectIntent(post.title, language);
  const trendScore = computeTrendScore(post);
  const normalizedQuestion = normalizeToAeoQuestion(post.title);
  
  // Generate SEO-friendly slug
  const slug = normalizedQuestion
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  
  return {
    slug,
    question: normalizedQuestion,
    short_answer: "", // To be filled by AI
    long_answer: "", // To be filled by AI
    sources: ["reddit"],
    trend_score: trendScore,
    relevance_score: post.relevanceScore || 0,
    intent,
    language,
    status: "draft",
    metadata: {
      reddit_url: post.url,
      subreddit: post.subreddit,
      original_title: post.title,
      detected_at: new Date().toISOString()
    }
  };
}

// Parse Reddit RSS to extract posts
function parseRedditRss(xml: string, subreddit: string): RealRedditPost[] {
  const posts: RealRedditPost[] = [];
  
  // Simple XML parsing for Reddit RSS feed
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    
    const titleMatch = entry.match(/<title>([^<]*)<\/title>/);
    const linkMatch = entry.match(/<link href="([^"]+)"/);
    const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
    const updatedMatch = entry.match(/<updated>([^<]+)<\/updated>/);
    
    if (titleMatch && linkMatch) {
      const url = linkMatch[1];
      // Extract post ID from URL: /r/subreddit/comments/POST_ID/...
      const idMatch = url.match(/\/comments\/([a-z0-9]+)/i);
      
      if (idMatch) {
        // Decode HTML entities in title
        const title = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        
        // Extract text from content (remove HTML)
        const content = contentMatch ? contentMatch[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 500) : "";
        
        posts.push({
          id: idMatch[1],
          title,
          body: content,
          subreddit,
          url,
          score: 0, // RSS doesn't provide score
          comments: 0, // RSS doesn't provide comment count
          createdUtc: updatedMatch ? Math.floor(new Date(updatedMatch[1]).getTime() / 1000) : 0
        });
      }
    }
  }
  
  return posts;
}

async function fetchRealRedditPosts(subreddit: string): Promise<RealRedditPost[]> {
  try {
    // Use RSS feed which is more permissive from server environments
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/new.rss?limit=25`,
      { 
        headers: { 
          "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        } 
      }
    );

    if (!res.ok) {
      // Try alternative: Pushshift API or fallback
      console.error(`[reddit-agent] RSS failed for r/${subreddit}: ${res.status}, trying fallback...`);
      
      // Fallback: Use a public Reddit search proxy
      const searchRes = await fetch(
        `https://www.reddit.com/search.json?q=subreddit:${subreddit}&sort=new&limit=20&restrict_sr=off`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        }
      );
      
      if (!searchRes.ok) {
        console.error(`[reddit-agent] Fallback also failed for r/${subreddit}: ${searchRes.status}`);
        return [];
      }
      
      const searchJson = await searchRes.json();
      if (searchJson.data?.children) {
        return searchJson.data.children
          .filter((p: any) => p.data && !p.data.stickied)
          .map((p: any) => ({
            id: p.data.id,
            title: p.data.title,
            body: p.data.selftext || "",
            subreddit: p.data.subreddit,
            url: `https://www.reddit.com${p.data.permalink}`,
            score: p.data.score || 0,
            comments: p.data.num_comments || 0,
            createdUtc: p.data.created_utc || 0
          }));
      }
      return [];
    }

    const xml = await res.text();
    const posts = parseRedditRss(xml, subreddit);
    
    console.log(`[reddit-agent] Fetched ${posts.length} posts from r/${subreddit} via RSS`);
    return posts;
  } catch (error) {
    console.error(`[reddit-agent] Error fetching r/${subreddit}:`, error);
    return [];
  }
}

/* =======================
   PROJECT CONTEXT LOADER
======================= */
interface ProjectContext {
  projectId: string;
  brandName: string;
  language: string;
  businessDescription: string;
  targetAudiences: string[];
  websiteUrl: string;
  businessType: string;
  competitors: string[];
  tone: string;
}

async function loadProjectContext(supabase: any, projectId: string): Promise<ProjectContext> {
  // Load project base info
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Load generation settings for extra context
  const { data: settings } = await supabase
    .from("generation_settings")
    .select("*")
    .eq("project_id", projectId)
    .single();

  // 🔒 FIXED: Cascade priority - settings first, then project data
  const effectiveLanguage = settings?.language || project?.language || "fr";
  const effectiveBrandName = settings?.brand_name || project?.brand_name || project?.name || "Your Brand";
  const effectiveBusinessDesc = settings?.business_description || project?.business_description || "";
  const effectiveAudiences = settings?.target_audiences || (project?.audience ? [project.audience] : []);
  const effectiveWebsiteUrl = settings?.website_url || project?.website_url || "";
  
  console.log(`[reddit-agent] Context loaded:`);
  console.log(`  - Brand: ${effectiveBrandName}`);
  console.log(`  - Language: ${effectiveLanguage}`);
  console.log(`  - URL: ${effectiveWebsiteUrl}`);
  console.log(`  - Description: ${effectiveBusinessDesc?.substring(0, 80)}...`);

  return {
    projectId,
    brandName: effectiveBrandName,
    language: effectiveLanguage,
    businessDescription: effectiveBusinessDesc,
    targetAudiences: effectiveAudiences,
    websiteUrl: effectiveWebsiteUrl,
    businessType: project.business_type || "General",
    competitors: settings?.competitors || project.competitors || [],
    tone: settings?.tone || "professional"
  };
}

/* =======================
   KEYWORD-BASED SUBREDDIT MAPPING (LANGUAGE-AWARE)
   🔥 ENHANCED: Added marketplace-specific subreddits for buy/sell
======================= */
function getSubredditsFromKeywords(keywords: string[], language: string): string[] {
  const subreddits = new Set<string>();
  
  // 🔥 Detect if this is a marketplace/buy-sell project
  const keywordStr = keywords.join(" ").toLowerCase();
  const isMarketplace = /vend|achet|occasion|seconde main|used|sell|buy|marketplace|occasion/i.test(keywordStr);
  const isFurniture = /meuble|furniture|canapé|sofa|table|chaise|lit|armoire|mobilier|décor|home|maison/i.test(keywordStr);
  
  // 🔥 MARKETPLACE-SPECIFIC SUBREDDITS (prioritized for buy/sell projects)
  if (isMarketplace || isFurniture) {
    if (language === "fr") {
      // French marketplace & furniture communities
      ["conseilachat", "Frugal_France", "AskFrance", "france", "lemauvaiscoin", "vosfinances"].forEach(s => subreddits.add(s));
    } else {
      // English marketplace & furniture communities  
      ["Flipping", "ThriftStoreHauls", "BuyItForLife", "Frugal", "secondhand", "furniture", "malelivingspace", "femalelivingspace", "HomeImprovement", "DesignMyRoom"].forEach(s => subreddits.add(s));
    }
  }
  
  // Category mappings with language-specific subreddits
  const categoryMap: Record<string, { fr: string[]; en: string[] }> = {
    // Tech/SaaS/Startup
    "tech|saas|startup|mvp|dev|application|logiciel|software|ai|ia|machine learning": {
      fr: ["startups_fr", "developpeurs", "vosfinances", "AskFrance", "france"],
      en: ["startups", "SideProject", "webdev", "Entrepreneur", "SaaS", "indiehackers"]
    },
    // Furniture/Home/Decor + BUY/SELL - ENHANCED for marketplace-style projects
    "meuble|furniture|décor|canapé|sofa|interior|design|maison|home|mobilier|fauteuil|table|lit|marbre|bois|rangement|étagère|armoire|miroir|chaise|bureau|salon|chambre|cuisine|salle de bain|déco|décoration|aménagement|intérieur|appartement|studio|location|occasion|vendre|acheter|seconde main|leboncoin|ikea": {
      fr: ["france", "AskFrance", "vosfinances", "conseilachat", "Frugal_France", "lemauvaiscoin"],
      en: ["InteriorDesign", "furniture", "homedesign", "HomeImprovement", "malelivingspace", "femalelivingspace", "DesignMyRoom", "homedecorating", "Flipping", "ThriftStoreHauls", "BuyItForLife", "Frugal", "secondhand"]
    },
    // E-commerce/Retail
    "ecommerce|boutique|shopify|vente|store|retail|commerce|magasin": {
      fr: ["ecommerce_france", "vosfinances", "entrepreneur", "france"],
      en: ["ecommerce", "shopify", "dropship", "Entrepreneur", "FulfillmentByAmazon"]
    },
    // Marketing/SEO
    "marketing|seo|traffic|référencement|growth|acquisition|leads|publicité": {
      fr: ["SEOfr", "marketing_france", "vosfinances", "france"],
      en: ["SEO", "marketing", "GrowthHacking", "bigseo", "digitalmarketing"]
    },
    // Freelance/Agency
    "freelance|agency|agence|consultant|client|prestataire": {
      fr: ["freelance_france", "vosfinances", "france", "AskFrance"],
      en: ["freelance", "webdev", "Entrepreneur", "DigitalNomad"]
    },
    // Finance/Investment + Buy/Sell
    "finance|investissement|argent|épargne|bourse|crypto|trading|achat|budget|prix|cher|pas cher|vendre|acheter|occasion": {
      fr: ["vosfinances", "france", "cryptoFR", "conseilachat", "AskFrance", "Frugal_France"],
      en: ["personalfinance", "investing", "stocks", "CryptoCurrency", "Frugal", "Flipping"]
    }
  };

  keywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    Object.entries(categoryMap).forEach(([pattern, subs]) => {
      if (new RegExp(pattern, "i").test(kwLower)) {
        // 🔒 CRITICAL: Only add subreddits for the project's language
        const langSubs = language === "fr" ? subs.fr : subs.en;
        langSubs.forEach(s => subreddits.add(s));
      }
    });
  });

  // Strict language-based fallback
  if (subreddits.size === 0) {
    if (language === "fr") {
      ["france", "vosfinances", "AskFrance", "conseilachat"].forEach(s => subreddits.add(s));
    } else {
      ["startups", "Entrepreneur", "smallbusiness", "webdev", "SideProject"].forEach(s => subreddits.add(s));
    }
  }

  console.log(`[reddit-agent] Generated ${subreddits.size} subreddits for lang=${language}: ${Array.from(subreddits).join(", ")}`);
  return Array.from(subreddits);
}

/* =======================
   🔥 NEW: RELEVANCE SCORING SYSTEM
======================= */
function computeRelevanceScore(
  post: RealRedditPost, 
  keywords: string[], 
  businessDescription: string,
  language: string,
  vertical: Vertical = "general"
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];
  const titleLower = post.title.toLowerCase();
  const bodyLower = (post.body || "").toLowerCase();
  const combinedText = `${titleLower} ${bodyLower}`;
  
  // 🔥 FURNITURE VERTICAL: Bonus for furniture object + marketplace context
  if (vertical === "furniture") {
    const furnitureCheck = isPostRelevantForFurniture(post, language);
    if (furnitureCheck.hasFurnitureObject) {
      score += 25;
      reasons.push("Furniture object");
      
      if (furnitureCheck.hasMarketplaceContext) {
        score += 20;
        reasons.push("Marketplace context");
      }
    }
  }
  
  // 🔥 EXACT KEYWORD MATCH BONUS (+30)
  const exactKeywordMatch = keywords.some(kw => {
    const kwLower = kw.toLowerCase();
    return kwLower.split(/\s+/).length >= 2 && combinedText.includes(kwLower);
  });
  if (exactKeywordMatch) {
    score += 30;
    reasons.push("Exact keyword match");
  }
  
  // 1. Keyword matches in title (+15 each, max 45)
  let titleMatches = 0;
  keywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    if (titleLower.includes(kwLower)) {
      titleMatches++;
      if (titleMatches <= 3) score += 15;
    }
  });
  if (titleMatches > 0) reasons.push(`${titleMatches} keyword(s) in title`);
  
  // 2. Keyword matches in body (+5 each, max 20)
  let bodyMatches = 0;
  keywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    if (bodyLower.includes(kwLower) && !titleLower.includes(kwLower)) {
      bodyMatches++;
      if (bodyMatches <= 4) score += 5;
    }
  });
  if (bodyMatches > 0) reasons.push(`${bodyMatches} keyword(s) in body`);
  
  // 3. Question post bonus (+20) - EXPANDED PATTERNS
  const questionPatterns = language === "fr"
    ? /^(comment|où|quel|quelle|quels|quelles|pourquoi|est-ce que|combien|qui|quand|faut-il|dois-je|peut-on|conseils?|avis|aide|besoin|cherche|idées?|inspiration|premier|nouvelle?)/i
    : /^(how|what|where|when|why|which|who|should|can|does|is|are|any|looking for|need|help|advice|recommend|ideas|inspiration|first|new)/i;
  
  if (questionPatterns.test(post.title)) {
    score += 20;
    reasons.push("Question post");
  }
  
  // 4. Help/advice request bonus (+15) - EXPANDED PATTERNS
  const helpPatterns = language === "fr"
    ? /(besoin|conseils?|avis|recommand|suggestion|cherche|où trouver|quel.*choisir|meilleur|pas cher|budget|opinion|retour d'expérience|petit budget|premier|nouvelle?|acheter|achat|qualité|durable|comparatif|alternative)/i
    : /(need|advice|recommend|suggest|looking for|where to|which.*should|best|budget|affordable|opinion|first time|new|buy|buying|quality|durable|compare|alternative)/i;
  
  if (helpPatterns.test(combinedText)) {
    score += 15;
    reasons.push("Help request");
  }
  
  // 5. Business description match (+10)
  const businessKeywords = businessDescription.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const businessMatches = businessKeywords.filter(bw => combinedText.includes(bw)).length;
  if (businessMatches >= 2) {
    score += 10;
    reasons.push("Business match");
  }
  
  // 6. Penalty for off-topic common Reddit content (-30)
  const offTopicPatterns = /(meme|shitpost|rant|vent|politics|trump|macron|élection|election|guerre|war|covid|vaccine|vaccin)/i;
  if (offTopicPatterns.test(combinedText)) {
    score -= 30;
    reasons.push("Off-topic content");
  }
  
  // 7. Penalty for wrong language (-50)
  const frenchIndicators = /\b(le|la|les|de|du|des|et|ou|pour|avec|une?|est|sont)\b/gi;
  const englishIndicators = /\b(the|and|or|for|with|in|is|are|was|were|have|has)\b/gi;
  const frenchCount = (combinedText.match(frenchIndicators) || []).length;
  const englishCount = (combinedText.match(englishIndicators) || []).length;
  const detectedLang = frenchCount > englishCount ? "fr" : "en";
  
  if (detectedLang !== language && (frenchCount + englishCount) > 5) {
    score -= 50;
    reasons.push("Wrong language");
  }
  
  // Normalize score 0-100
  score = Math.max(0, Math.min(100, score));
  
  return { 
    score, 
    reason: reasons.length > 0 ? reasons.join(", ") : "No specific match"
  };
}

/* =======================
   🔥 NEW: REDDIT KEYWORD SEARCH
======================= */
async function searchRedditByKeywords(keywords: string[], language: string): Promise<RealRedditPost[]> {
  const posts: RealRedditPost[] = [];
  
  // Build search query from top keywords
  const searchTerms = keywords.slice(0, 5).join(" OR ");
  const searchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(searchTerms)}&sort=new&limit=30&type=link`;
  
  console.log(`[reddit-agent] Searching Reddit for: ${searchTerms}`);
  
  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });
    
    if (!res.ok) {
      console.error(`[reddit-agent] Search failed: ${res.status}`);
      return posts;
    }
    
    const data = await res.json();
    
    if (data.data?.children) {
      for (const child of data.data.children) {
        const post = child.data;
        if (post && !post.stickied && !post.over_18) {
          // 🔥 IMPROVED: Don't filter by language here - let relevance scoring handle it
          // This allows finding posts in ANY subreddit that discuss the topic
          posts.push({
            id: post.id,
            title: post.title,
            body: post.selftext || "",
            subreddit: post.subreddit,
            url: `https://www.reddit.com${post.permalink}`,
            score: post.score || 0,
            comments: post.num_comments || 0,
            createdUtc: post.created_utc || 0
          });
        }
      }
    }
    
    console.log(`[reddit-agent] Found ${posts.length} posts via Reddit keyword search`);
  } catch (err) {
    console.error(`[reddit-agent] Search error:`, err);
  }
  
  return posts;
}

/* =======================
   🔥 NEW: GOOGLE SEARCH FOR REDDIT POSTS VIA FIRECRAWL
   Searches Google with "site:reddit.com" to find ALL relevant posts
======================= */
async function searchRedditViaGoogle(
  keywords: string[], 
  language: string,
  firecrawlApiKey: string
): Promise<RealRedditPost[]> {
  const posts: RealRedditPost[] = [];
  
  if (!firecrawlApiKey) {
    console.log(`[reddit-agent] No Firecrawl API key, skipping Google search`);
    return posts;
  }
  
  // 🔥 ENHANCED: Detect if this is a marketplace/buy-sell query
  const keywordStr = keywords.join(" ").toLowerCase();
  const isMarketplace = /vend|achet|occasion|meuble|furniture|sell|buy|used|second/i.test(keywordStr);
  
  // Build Google search query: site:reddit.com + keywords
  // Use marketplace-specific terms for buy/sell projects
  let langFilter: string;
  if (isMarketplace) {
    langFilter = language === "fr" 
      ? "vendre OR acheter OR occasion OR ikea OR leboncoin OR meuble" 
      : "sell OR buy OR used OR furniture OR marketplace OR ikea";
  } else {
    langFilter = language === "fr" 
      ? "conseil OR avis OR recommandation" 
      : "advice OR recommend OR help";
  }
  
  const searchQuery = `site:reddit.com ${keywords.slice(0, 4).join(" ")} ${langFilter}`;
  
  console.log(`[reddit-agent] 🔥 Searching Google for Reddit posts: "${searchQuery}"`);
  
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 25, // Increased for better coverage
        lang: language === "fr" ? "fr" : "en",
        tbs: "qdr:y", // Last year for more results
      }),
    });
    
    if (!response.ok) {
      console.error(`[reddit-agent] Firecrawl search failed: ${response.status}`);
      return posts;
    }
    
    const data = await response.json();
    
    if (data.success && data.data) {
      for (const result of data.data) {
        // Extract Reddit post info from Google result
        const url = result.url || "";
        
        // Only process actual Reddit post URLs (not subreddit pages)
        if (url.includes("reddit.com") && url.includes("/comments/")) {
          // Extract post ID from URL
          const idMatch = url.match(/\/comments\/([a-z0-9]+)/i);
          if (idMatch) {
            // Extract subreddit from URL
            const subMatch = url.match(/\/r\/([^\/]+)/);
            const subreddit = subMatch ? subMatch[1] : "unknown";
            
            posts.push({
              id: idMatch[1],
              title: result.title || "Untitled",
              body: result.description || "",
              subreddit,
              url: url.split("?")[0], // Clean URL
              score: 0,
              comments: 0,
              createdUtc: Math.floor(Date.now() / 1000) - 86400 * 7 // Assume ~1 week old
            });
          }
        }
      }
    }
    
    console.log(`[reddit-agent] 🔥 Found ${posts.length} Reddit posts via Google search`);
  } catch (err) {
    console.error(`[reddit-agent] Google search error:`, err);
  }
  
  return posts;
}

/* =======================
   COHERENCE SCORING
======================= */
function computeCoherenceScore(content: string, context: ProjectContext): number {
  let score = 100;

  // Language check: detect wrong language
  const frenchIndicators = /\b(le|la|les|de|du|des|et|ou|pour|avec|dans|sur|une?|est|sont|été)\b/gi;
  const englishIndicators = /\b(the|and|or|for|with|in|on|is|are|was|were|been|have|has)\b/gi;
  
  const frenchMatches = (content.match(frenchIndicators) || []).length;
  const englishMatches = (content.match(englishIndicators) || []).length;
  
  const detectedLanguage = frenchMatches > englishMatches ? "fr" : "en";
  
  if (detectedLanguage !== context.language) {
    score -= 40; // Heavy penalty for wrong language
    console.log(`[reddit-agent] Language mismatch: expected ${context.language}, detected ${detectedLanguage}`);
  }

  // Brand mention check
  if (context.brandName && !new RegExp(escapeRegex(context.brandName), "i").test(content)) {
    score -= 10; // Minor penalty if brand not mentioned when it should be
  }

  // Check for competing brand mentions (CRITICAL)
  const competitorMentions = context.competitors.filter(comp => 
    new RegExp(escapeRegex(comp), "i").test(content)
  );
  if (competitorMentions.length > 0) {
    score -= 20 * competitorMentions.length;
    console.log(`[reddit-agent] Competitor mentioned: ${competitorMentions.join(", ")}`);
  }

  // Check for off-topic content (SaaS in furniture context, etc.)
  const offTopicPatterns = detectOffTopicPatterns(content, context);
  score -= offTopicPatterns * 15;

  return Math.max(0, Math.min(100, score));
}

function detectOffTopicPatterns(content: string, context: ProjectContext): number {
  let offTopicCount = 0;
  const lowerContent = content.toLowerCase();
  const lowerBusiness = context.businessDescription.toLowerCase();
  
  // If business is furniture/home, SaaS/tech terms are off-topic
  if (/meuble|canapé|décor|mobilier|furniture|sofa|home/i.test(lowerBusiness)) {
    if (/saas|api|tech|startup|mvp|code|développeur|developer|software/i.test(lowerContent)) {
      offTopicCount++;
    }
  }
  
  // If business is tech/SaaS, furniture terms are off-topic
  if (/saas|tech|startup|software|application|développement/i.test(lowerBusiness)) {
    if (/meuble|canapé|décor|mobilier|furniture|sofa|interior design/i.test(lowerContent)) {
      offTopicCount++;
    }
  }

  return offTopicCount;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("OPENROUTER_API_KEY")!;
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestBody = await req.json();
    const { 
      projectId, 
      action, 
      subreddits = [], 
      keywords = [],
      language,
      business_description,
      target_audiences = [],
      title,
      body,
      subreddit,
      mention_brand = false,
      include_link = false,
      tone = "expert_human",
      brand_name,
      brand_url,
      save_as_aeo = false,
      storeInDb = false
    }: RedditRequest & { storeInDb?: boolean } = requestBody;

    console.log(`[reddit-agent] Action: ${action}${projectId ? ` for project ${projectId}` : ""}`);

    // Handle aeo-reply action
    if (action === "aeo-reply") {
      if (!title || !subreddit) {
        throw new Error("title and subreddit are required for aeo-reply action");
      }
      
      // 🔥 FIXED: Load full project context if projectId is provided
      let contextForReply: ProjectContext | null = null;
      if (projectId) {
        contextForReply = await loadProjectContext(supabase, projectId);
        console.log(`[reddit-agent] Loaded context for ${contextForReply.brandName} (${contextForReply.language})`);
      }
      
      const effectiveLanguage = contextForReply?.language || language || "en";
      const effectiveBrandName = contextForReply?.brandName || brand_name || "";
      const effectiveBrandUrl = contextForReply?.websiteUrl || brand_url || "";
      const effectiveBusinessDesc = contextForReply?.businessDescription || business_description || "";
      const effectiveTone = contextForReply?.tone || tone;
      
      const result = await generateRedditReply(
        title, 
        body || "", 
        subreddit, 
        mention_brand,
        include_link,
        effectiveTone, 
        effectiveBrandName,
        effectiveBrandUrl,
        effectiveLanguage,
        effectiveBusinessDesc,
        lovableApiKey
      );
      
      // 🔒 COHERENCE CHECK: Validate reply matches project context
      if (contextForReply) {
        const coherenceScore = computeCoherenceScore(result.reply, contextForReply);
        console.log(`[reddit-agent] Coherence score: ${coherenceScore}/100`);
        
        if (coherenceScore < 60) {
          console.warn(`[reddit-agent] Low coherence score (${coherenceScore}), content may be off-topic`);
          // Could regenerate here, but for now just log warning
        }
      }
      
      // 🔥 Strategic: Reddit → AEO pipeline with INTENT + TREND SCORE
      let aeoQuestionId: string | null = null;
      if (save_as_aeo && projectId) {
        try {
          const normalizedQuestion = normalizeToAeoQuestion(title);
          const detectedIntent = detectIntent(title, effectiveLanguage);
          
          // Create a mock post for trend calculation
          const mockPost: RealRedditPost = {
            id: "temp",
            title,
            body: body || "",
            subreddit,
            url: "",
            score: 0,
            comments: 0,
            createdUtc: Math.floor(Date.now() / 1000)
          };
          const trendScore = computeTrendScore(mockPost);
          
          const { data: inserted } = await supabase
            .from("answers")
            .insert({
              project_id: projectId,
              question: normalizedQuestion,
              answer: "",
              slug: normalizedQuestion.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 100),
              platforms: ["chatgpt", "gemini", "claude"],
              score: trendScore, // 🔥 Use trend score
              is_public: false,
              intent: detectedIntent, // 🔥 Use detected intent
              difficulty: trendScore >= 70 ? "easy" : trendScore >= 40 ? "medium" : "hard",
              supporting_content: {
                source: "reddit",
                subreddit,
                original_title: title,
                trend_score: trendScore,
                intent: detectedIntent,
                status: "pending_aeo",
                detected_at: new Date().toISOString()
              }
            })
            .select("id")
            .single();
          
          aeoQuestionId = inserted?.id || null;
          console.log(`[reddit-agent] Saved to AEO: ${aeoQuestionId} | intent=${detectedIntent} | trend=${trendScore}`);
        } catch (aeoError) {
          console.error(`[reddit-agent] Failed to save AEO question:`, aeoError);
        }
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          action,
          ...result,
          aeoQuestionId,
          generatedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Other actions require projectId
    if (!projectId) {
      throw new Error("projectId is required for this action");
    }

    // 🔥 FIXED: Load FULL project context (brand, language, business, tone)
    const projectContext = await loadProjectContext(supabase, projectId);
    console.log(`[reddit-agent] Loaded context: ${projectContext.brandName} | ${projectContext.language} | ${projectContext.businessType}`);

    // Validate language consistency
    if (language && language !== projectContext.language) {
      console.warn(`[reddit-agent] Language override: request=${language}, project=${projectContext.language}`);
    }

    // 🔥 NEW: Fetch keywords from database if none provided
    let effectiveKeywords = keywords;
    if (effectiveKeywords.length === 0) {
      console.log(`[reddit-agent] No keywords provided, fetching from database...`);
      const { data: dbKeywords, error: keywordsError } = await supabase
        .from("keywords")
        .select("keyword")
        .eq("project_id", projectId)
        .limit(20);

      if (!keywordsError && dbKeywords && dbKeywords.length > 0) {
        effectiveKeywords = dbKeywords.map(k => k.keyword);
        console.log(`[reddit-agent] Using ${effectiveKeywords.length} keywords from database`);
      }
    }

    let redditData: unknown[] = [];

    // Scrape Reddit using Firecrawl if available
    if (firecrawlApiKey && subreddits.length > 0) {
      try {
        for (const sub of subreddits.slice(0, 3)) {
          const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: `https://www.reddit.com/r/${sub}/new/.json?limit=25`,
              formats: ["markdown"],
            }),
          });

          if (scrapeResponse.ok) {
            const data = await scrapeResponse.json();
            redditData.push({
              subreddit: sub,
              content: data.data?.markdown || "",
            });
          }
        }
        console.log(`[reddit-agent] Scraped ${redditData.length} subreddits`);
      } catch (scrapeError) {
        console.error(`[reddit-agent] Firecrawl error:`, scrapeError);
      }
    }

    let result;
    // storeInDb is now read from the initial requestBody parsing above

    switch (action) {
      case "find-opportunities":
        result = await findOpportunities(
          projectContext, 
          effectiveKeywords, 
          subreddits, 
          lovableApiKey,
          firecrawlApiKey || ""
        );
        
        // 🔥 ENHANCED: Store opportunities with TREND SCORE + INTENT
        if (storeInDb && result.opportunities && result.opportunities.length > 0) {
          console.log(`[reddit-agent] Storing ${result.opportunities.length} opportunities with trend data`);
          
          for (const opp of result.opportunities.slice(0, 20)) {
            try {
              // Check if this post already exists (by URL)
              const { data: existing } = await supabase
                .from("reddit_responses")
                .select("id")
                .eq("project_id", projectId)
                .eq("reddit_post_url", opp.url)
                .limit(1);
              
              if (!existing || existing.length === 0) {
                // 🔥 Calculate trend score and intent
                const trendScore = opp.trendScore || computeTrendScore({
                  id: opp.id,
                  title: opp.title,
                  body: opp.body || "",
                  subreddit: opp.subreddit,
                  url: opp.url,
                  score: opp.score || 0,
                  comments: opp.comments || 0,
                  createdUtc: opp.createdUtc || Math.floor(Date.now() / 1000)
                });
                const intent = detectIntent(opp.title, projectContext.language);
                
                await supabase
                  .from("reddit_responses")
                  .insert({
                    project_id: projectId,
                    subreddit: opp.subreddit?.replace("r/", "") || "unknown",
                    reddit_post_title: opp.title || "Untitled",
                    reddit_post_url: opp.url,
                    generated_reply: "", // Empty until user generates
                    original_question: normalizeToAeoQuestion(opp.title),
                    is_posted_to_reddit: false,
                    is_shared: false,
                    // 🔥 Store answer-ready JSON in reply_mode (repurposed)
                    reply_mode: JSON.stringify({
                      trend_score: trendScore,
                      relevance_score: opp.relevanceScore || 0,
                      intent,
                      language: projectContext.language,
                      detected_at: new Date().toISOString()
                    })
                  });
                
                console.log(`[reddit-agent] Stored: ${opp.title.substring(0, 50)} | trend=${trendScore} | intent=${intent}`);
              }
            } catch (insertErr) {
              console.error(`[reddit-agent] Failed to insert opportunity:`, insertErr);
            }
          }
        }
        break;
      case "generate-responses":
        result = await generateResponses(projectContext, subreddits, effectiveKeywords, lovableApiKey);
        break;
      case "analyze-subreddits":
        result = await analyzeSubreddits(projectContext, subreddits, lovableApiKey);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`[reddit-agent] Action ${action} completed`);

    return new Response(
      JSON.stringify({
        success: true,
        action,
        projectId,
        ...result,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[reddit-agent] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// 🔥 FIXED: Use REAL Reddit posts with LOCKED project context + RELEVANCE SCORING
async function findOpportunities(
  context: ProjectContext,
  keywords: string[],
  subreddits: string[],
  apiKey: string,
  firecrawlApiKey: string = ""
): Promise<{ opportunities: any[] }> {
  
  // 🔒 FIXED: Use keywords to generate language-specific subreddits
  const targetSubreddits = subreddits.length > 0 
    ? subreddits.slice(0, 8) 
    : getSubredditsFromKeywords(keywords, context.language);

  console.log(`[reddit-agent] Finding opportunities for ${context.brandName} | lang=${context.language} | subs=${targetSubreddits.join(", ")}`);
  console.log(`[reddit-agent] Keywords: ${keywords.slice(0, 10).join(", ")}`);

  // 1. Fetch REAL posts from Reddit subreddits
  const allPosts: RealRedditPost[] = [];
  for (const sub of targetSubreddits) {
    const posts = await fetchRealRedditPosts(sub);
    allPosts.push(...posts);
    await new Promise(r => setTimeout(r, 200));
  }

  // 2. 🔥 NEW: Also search Reddit by keywords directly
  if (keywords.length > 0) {
    const searchPosts = await searchRedditByKeywords(keywords, context.language);
    // Add unique posts (not already in allPosts)
    const existingIds = new Set(allPosts.map(p => p.id));
    for (const post of searchPosts) {
      if (!existingIds.has(post.id)) {
        allPosts.push(post);
        existingIds.add(post.id);
      }
    }
  }

  // 3. 🔥 ENHANCED: Search Google for Reddit posts with marketplace-specific queries
  if (keywords.length > 0 && firecrawlApiKey) {
    console.log(`[reddit-agent] 🔥 Using Google search for Reddit posts (marketplace-enhanced)...`);
    
    // Use specific marketplace-related keywords for furniture/buy-sell
    const marketplaceKeywords = keywords.filter(k => 
      /meuble|occasion|vend|achet|canapé|table|furniture|sell|buy|used/i.test(k)
    );
    const searchKeywords = marketplaceKeywords.length > 0 ? marketplaceKeywords : keywords;
    
    const googlePosts = await searchRedditViaGoogle(searchKeywords, context.language, firecrawlApiKey);
    const existingIds = new Set(allPosts.map(p => p.id));
    for (const post of googlePosts) {
      if (!existingIds.has(post.id)) {
        allPosts.push(post);
        existingIds.add(post.id);
      }
    }
    console.log(`[reddit-agent] After Google search: ${allPosts.length} total posts`);
  }

  console.log(`[reddit-agent] Fetched ${allPosts.length} total Reddit posts`);

  if (allPosts.length === 0) {
    return { opportunities: [] };
  }

  // 🔥 DETECT VERTICAL EARLY for filtering
  const vertical = detectVertical(context);
  console.log(`[reddit-agent] Detected vertical: ${vertical}`);
  
  // 🔥 KEYWORD-FIRST FILTER — Use project keywords as PRIMARY filter
  // For FURNITURE vertical: STRICT filtering requires furniture object
  let filteredPosts = allPosts;
  
  if (vertical === "furniture") {
    console.log(`[reddit-agent] 🔥 STRICT FURNITURE FILTER: Posts MUST contain furniture objects...`);
    filteredPosts = filteredPosts.filter(p => isPostRelevantToProject(p, keywords, context.language, "furniture"));
    console.log(`[reddit-agent] ${filteredPosts.length}/${allPosts.length} posts contain furniture objects`);
  } else if (keywords.length > 0) {
    console.log(`[reddit-agent] 🔥 KEYWORD FILTER: Using ${keywords.length} project keywords...`);
    filteredPosts = filteredPosts.filter(p => isPostRelevantToProject(p, keywords, context.language, vertical));
    console.log(`[reddit-agent] ${filteredPosts.length}/${allPosts.length} posts match project keywords`);
  } else {
    // FALLBACK: Use vertical detection only if NO keywords available
    console.log(`[reddit-agent] ⚠️ FALLBACK: No keywords, using ${vertical} vertical filter`);
    
    if (vertical !== "general") {
      filteredPosts = filteredPosts.filter(p => isPostRelevantToVertical(p, vertical));
      console.log(`[reddit-agent] ${filteredPosts.length}/${allPosts.length} posts match ${vertical} vertical`);
    }
  }

  // 🔒 PATCH 2 — REMOVE FORBIDDEN SUBREDDITS
  const forbiddenSubs = FORBIDDEN_SUBS_BY_VERTICAL[vertical] || [];

  if (forbiddenSubs.length > 0) {
    const beforeCount = filteredPosts.length;
    filteredPosts = filteredPosts.filter(
      p => !forbiddenSubs.some(
        (forbidden: string) => p.subreddit.toLowerCase() === forbidden.toLowerCase()
      )
    );
    console.log(`[reddit-agent] Removed ${beforeCount - filteredPosts.length} posts from forbidden subreddits`);
  }

  // 🔒 PATCH 3 — IF NOTHING LEFT → TRY REDDIT SEARCH WITH KEYWORDS
  if (filteredPosts.length === 0 && keywords.length > 0) {
    console.log(`[reddit-agent] ⚠️ No matching posts. Trying Reddit keyword search...`);
    const searchPosts = await searchRedditByKeywords(keywords.slice(0, 5), context.language);
    filteredPosts = searchPosts.filter(p => isPostRelevantToProject(p, keywords, context.language, vertical));
    console.log(`[reddit-agent] Reddit search found ${filteredPosts.length} relevant posts`);
  }
  
  if (filteredPosts.length === 0) {
    console.log(`[reddit-agent] ❌ No keyword-matching posts found. Returning empty.`);
    return { opportunities: [] };
  }

  // 3. 🔥 Compute relevance score for filtered posts (pass vertical for furniture bonus)
  const scoredPosts = filteredPosts.map(post => {
    const { score, reason } = computeRelevanceScore(
      post, 
      keywords, 
      context.businessDescription,
      context.language,
      vertical
    );
    return {
      ...post,
      relevanceScore: score,
      relevanceReason: reason
    };
  });

  // 🔥 FURNITURE VERTICAL: Higher threshold (40) to filter noise
  // Other verticals: Standard threshold (25)
  const MIN_RELEVANCE = vertical === "furniture" ? 40 : 25;
  const relevantPosts = scoredPosts.filter(p => p.relevanceScore >= MIN_RELEVANCE);
  
  console.log(`[reddit-agent] ${relevantPosts.length}/${scoredPosts.length} posts passed relevance filter (>=${MIN_RELEVANCE}, vertical=${vertical})`)
  
  // 🔒 PATCH 4 — NO FALLBACK: If no relevant posts, return empty
  if (relevantPosts.length === 0) {
    console.log(`[reddit-agent] ❌ No posts with relevance >= ${MIN_RELEVANCE}. Returning empty (no generic fallback).`);
    return { opportunities: [] };
  }

  // 5. Sort by relevance score (highest first)
  relevantPosts.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  // 6. Take top 20 for AI qualification
  const postsForAI = relevantPosts.slice(0, 20).map(p => ({
    id: p.id,
    title: p.title,
    body: (p.body || "").substring(0, 200),
    subreddit: p.subreddit,
    url: p.url,
    score: p.score,
    comments: p.comments,
    relevanceScore: p.relevanceScore,
    relevanceReason: p.relevanceReason
  }));

  // 7. If we have enough relevant posts, skip AI and return directly with TREND + INTENT
  if (relevantPosts.length >= 5) {
    console.log(`[reddit-agent] Returning ${relevantPosts.length} pre-scored relevant posts with trend data`);
    return {
      opportunities: relevantPosts.slice(0, 20).map(p => {
        const trendScore = computeTrendScore(p);
        const intent = detectIntent(p.title, context.language);
        return {
          id: p.id,
          subreddit: p.subreddit,
          title: p.title,
          body: p.body,
          url: p.url,
          score: p.score,
          comments: p.comments,
          createdUtc: p.createdUtc,
          relevanceScore: p.relevanceScore,
          relevanceReason: p.relevanceReason,
          trendScore,
          intent,
          engagementPotential: p.relevanceScore >= 50 ? "high" : p.relevanceScore >= 30 ? "medium" : "low"
        };
      })
    };
  }

  // 8. If very few relevant posts, use AI to find more from general posts
  const generalPosts = scoredPosts
    .filter(p => p.relevanceScore < MIN_RELEVANCE)
    .slice(0, 20);

  const combinedPosts = [...relevantPosts, ...generalPosts].slice(0, 30);

  const prompt = `You are analyzing REAL Reddit posts to find engagement opportunities.

🔒 LOCKED CONTEXT (DO NOT DEVIATE):
- Brand: ${context.brandName}
- Language: ${context.language === "fr" ? "FRENCH (répondre uniquement en français)" : "ENGLISH (respond only in English)"}
- Industry: ${context.businessType}
- Business Description: ${context.businessDescription}
- Target Audiences: ${context.targetAudiences.join(", ") || "General"}
- Keywords: ${keywords.join(", ") || "general topics"}

Here are posts with their pre-computed relevance scores:
${JSON.stringify(postsForAI, null, 2)}

Select the TOP 10 posts where replying would be:
1. HIGHLY RELEVANT to "${context.brandName}"'s expertise
2. Natural place to share knowledge (not promotional)
3. Questions, help requests, or discussions work best
4. ${context.language === "fr" ? "ONLY French posts" : "English posts only"}

Return JSON with these fields:
{
  "opportunities": [
    {
      "id": "exact_post_id",
      "subreddit": "exact_subreddit",
      "title": "exact_title",
      "body": "post body if any",
      "url": "exact_url_from_input",
      "score": number,
      "comments": number,
      "relevanceScore": number (keep from input or adjust 0-100),
      "relevanceReason": "Why relevant",
      "engagementPotential": "high|medium|low"
    }
  ]
}

CRITICAL: Return ONLY posts from the input. Do NOT invent URLs.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        { 
          role: "system", 
          content: `You are a Reddit analyst for ${context.brandName}. Return valid JSON only.` 
        },
        { role: "user", content: prompt }
      ],
    }),
  });

  if (!response.ok) {
    console.error(`[reddit-agent] AI API error: ${response.status}`);
    // Fallback: return pre-scored posts
    return {
      opportunities: relevantPosts.slice(0, 15).map(p => ({
        id: p.id,
        subreddit: p.subreddit,
        title: p.title,
        body: p.body,
        url: p.url,
        score: p.score,
        comments: p.comments,
        relevanceScore: p.relevanceScore,
        relevanceReason: p.relevanceReason,
        engagementPotential: p.relevanceScore >= 50 ? "high" : "medium"
      }))
    };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || [null, content];
    const parsed = JSON.parse(jsonMatch[1] || content);
    
    // Validate URLs
    const normalizeUrl = (url: string): string => {
      return url
        .replace(/\/$/, '')
        .replace(/^https?:\/\/(www\.)?/, '')
        .replace(/\?.*$/, '')
        .toLowerCase();
    };
    
    const normalizedValidUrls = new Map<string, RealRedditPost>();
    combinedPosts.forEach(p => {
      normalizedValidUrls.set(normalizeUrl(p.url), p);
    });
    
    const validatedOpportunities = (parsed.opportunities || [])
      .map((opp: any) => {
        if (!opp.url) return null;
        const normalizedOppUrl = normalizeUrl(opp.url);
        const originalPost = normalizedValidUrls.get(normalizedOppUrl);
        if (originalPost) {
          return { 
            ...opp, 
            url: originalPost.url,
            relevanceScore: opp.relevanceScore || originalPost.relevanceScore,
            relevanceReason: opp.relevanceReason || originalPost.relevanceReason
          };
        }
        return null;
      })
      .filter(Boolean);

    console.log(`[reddit-agent] Validated ${validatedOpportunities.length} opportunities`);
    
    // 🔒 PATCH 4 — NO FALLBACK: If validation fails, return empty (not generic posts)
    if (validatedOpportunities.length === 0) {
      console.log(`[reddit-agent] ❌ AI validation returned 0 valid opportunities. Returning empty.`);
      return { opportunities: [] };
    }
    
    // 🔒 PATCH 5 — Final relevance filter before returning
    const finalOpportunities = validatedOpportunities.filter(
      (opp: any) => (opp.relevanceScore ?? 0) >= MIN_RELEVANCE
    );
    
    console.log(`[reddit-agent] ✅ Returning ${finalOpportunities.length} validated opportunities`);
    return { opportunities: finalOpportunities };
  } catch (parseError) {
    console.error(`[reddit-agent] JSON parse error:`, parseError);
    // 🔒 PATCH 4 — NO FALLBACK on parse error either
    console.log(`[reddit-agent] ❌ Parse error, returning empty (no generic fallback).`);
    return { opportunities: [] };
  }
}

async function generateResponses(
  context: ProjectContext,
  subreddits: string[],
  keywords: string[],
  apiKey: string
): Promise<{ responses: Array<{ subreddit: string; topic: string; response: string }> }> {
  const prompt = `Generate helpful Reddit responses for a brand:

🔒 LOCKED CONTEXT:
- Brand: ${context.brandName}
- Website: ${context.websiteUrl}
- Industry: ${context.businessType}
- Business: ${context.businessDescription}
- Language: ${context.language === "fr" ? "FRENCH (répondre en français uniquement)" : "ENGLISH only"}
- Subreddits to target: ${subreddits.join(", ") || "general industry subreddits"}
- Topics/Keywords: ${keywords.join(", ") || "industry topics"}

Create 5 template responses that:
1. Answer common questions in the industry
2. Share useful tips and insights
3. Are genuinely helpful, not promotional
4. Build authority and trust for ${context.brandName}
5. Follow Reddit community guidelines
6. Are written ENTIRELY in ${context.language === "fr" ? "French" : "English"}

Return JSON:
{
  "responses": [
    {
      "subreddit": "target_subreddit",
      "topic": "Topic/question type",
      "response": "The helpful response text..."
    }
  ]
}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        { 
          role: "system", 
          content: `You are a Reddit expert working EXCLUSIVELY for ${context.brandName}. 
Write ONLY in ${context.language === "fr" ? "FRENCH" : "ENGLISH"}. Respond with valid JSON only.` 
        },
        { role: "user", content: prompt }
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || [null, content];
    return JSON.parse(jsonMatch[1] || content);
  } catch {
    return { responses: [] };
  }
}

async function analyzeSubreddits(
  context: ProjectContext,
  subreddits: string[],
  apiKey: string
): Promise<{ analysis: Array<{ subreddit: string; relevance: number; audienceMatch: number; activityLevel: string; bestPostTypes: string[] }> }> {
  
  // Suggest subreddits based on language
  const defaultSuggestions = context.language === "fr"
    ? "france, vosfinances, entrepreneur, startups, developpeurs"
    : "startups, Entrepreneur, SideProject, webdev, smallbusiness";

  const prompt = `Analyze subreddits for marketing potential:

🔒 LOCKED CONTEXT:
- Brand: ${context.brandName}
- Industry: ${context.businessType}
- Target Audience: ${context.targetAudiences.join(", ") || "General audience"}
- Language: ${context.language === "fr" ? "FRENCH (prioritize French-speaking subreddits)" : "ENGLISH"}
- Subreddits to analyze: ${subreddits.join(", ") || defaultSuggestions}

For each subreddit, analyze:
1. Relevance to ${context.brandName} (0-100)
2. Audience match for ${context.businessDescription.substring(0, 100)} (0-100)
3. Activity level (high/medium/low)
4. Best types of posts for engagement
5. Key topics discussed

Return JSON (respond in ${context.language === "fr" ? "French" : "English"}):
{
  "analysis": [
    {
      "subreddit": "subreddit_name",
      "relevance": 85,
      "audienceMatch": 90,
      "activityLevel": "high",
      "bestPostTypes": ["questions", "tutorials", "discussions"],
      "keyTopics": ["topic1", "topic2"]
    }
  ],
  "recommendedSubreddits": ["sub1", "sub2", "sub3"]
}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        { 
          role: "system", 
          content: `You are a Reddit analyst working for ${context.brandName}. 
Respond in ${context.language === "fr" ? "FRENCH" : "ENGLISH"} with valid JSON only.` 
        },
        { role: "user", content: prompt }
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || [null, content];
    return JSON.parse(jsonMatch[1] || content);
  } catch {
    return { analysis: [] };
  }
}

// 🔒 PATCH 3 — Reddit tone with language support
async function generateRedditReply(
  title: string,
  body: string,
  subreddit: string,
  mentionBrand: boolean,
  includeLink: boolean,
  tone: string,
  brandName: string,
  brandUrl: string,
  language: string,
  businessDescription: string,
  apiKey: string
): Promise<{ reply: string; estimatedScore: number; brandMentioned: boolean; linkIncluded: boolean }> {
  
  const toneInstructions: Record<string, string> = {
    expert_human: "Write like someone who's been doing this for years. Share from experience, not theory.",
    casual: "Write like you're chatting with a friend. Keep it real, maybe a bit sarcastic.",
    professional: "Write clearly but warmly. No corporate speak. Be direct and helpful."
  };

  // Language-specific instructions
  const languageInstructions = language === "fr" 
    ? "Écris en français naturel et conversationnel. Utilise le tutoiement si approprié sur Reddit."
    : "Write in natural, conversational English.";

  // 🔥 ENHANCED: ALWAYS include brand + link intelligently when requested
  // Brand mention is guaranteed if mentionBrand=true, link is added intelligently
  const shouldMentionBrand = mentionBrand && !!brandName;
  const shouldIncludeLink = includeLink && !!brandUrl && shouldMentionBrand;
  const actualBrandName = brandName || (language === "fr" ? "un outil que j'ai testé" : "a tool I tried");

  // Business context for more relevant replies
  const businessContext = businessDescription 
    ? `\nYour expertise context (use subtly): ${businessDescription}` 
    : "";

  // 🔒 System prompt with language awareness
  const systemPrompt = `You are a real Reddit user.
You write like someone who has actually done the work.
No jargon. No teaching. No SEO terms. No marketing language.
No structured lists unless it feels natural.
Short paragraphs. One idea per paragraph.
Slight uncertainty is OK ("I think", "in my case", "YMMV").
Never sound like an article or a blog post.
Never mention AI, machine learning, or automation.
${languageInstructions}
Tone: ${toneInstructions[tone] || toneInstructions.expert_human}${businessContext}`;

  // 🔥 Build brand/link instruction based on context
  let brandInstruction = "";
  if (shouldMentionBrand) {
    if (shouldIncludeLink) {
      // Include BOTH brand + link intelligently
      brandInstruction = language === "fr"
        ? `- Tu DOIS mentionner "${actualBrandName}" naturellement comme quelque chose que tu as testé/utilisé (1 phrase max). Glisse aussi le lien ${brandUrl} de façon naturelle, par exemple "j'ai testé ${actualBrandName} (${brandUrl})" ou "perso j'utilise ${actualBrandName}, leur site: ${brandUrl}"`
        : `- You MUST naturally mention "${actualBrandName}" as something you tried/used (1 phrase max). Also casually include the link ${brandUrl}, like "I've been using ${actualBrandName} (${brandUrl})" or "personally I use ${actualBrandName}, their site: ${brandUrl}"`;
    } else {
      // Include brand only, no link
      brandInstruction = language === "fr"
        ? `- Tu DOIS mentionner "${actualBrandName}" naturellement comme quelque chose que tu as testé (1 phrase max, ultra casual)`
        : `- You MUST naturally mention "${actualBrandName}" as something you personally tried (1 phrase max, ultra casual)`;
    }
  } else {
    brandInstruction = "- Do NOT mention any product, tool, or service by name";
  }

  const userPrompt = `Reddit post to respond to:
Title: ${title}
${body ? `Body: ${body}` : "(No body text)"}
Subreddit: r/${subreddit}

Write a Reddit comment ${language === "fr" ? "EN FRANÇAIS" : "in English"} that:
- Answers practically as a fellow Redditor who's been there
- Maximum 100 words (shorter is better)
- Ends with a casual question or "curious what others think"
- Sounds like a real person, not a consultant
${brandInstruction}

Write the Reddit comment now:`;

  console.log(`[reddit-agent] Generating reply for r/${subreddit}: "${title.substring(0, 50)}..." (brand: ${shouldMentionBrand}, link: ${shouldIncludeLink})`);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[reddit-agent] AI API error:`, response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    if (response.status === 402) {
      throw new Error("AI credits exhausted. Please add funds to continue.");
    }
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const rawReply = data.choices?.[0]?.message?.content?.trim();

  if (!rawReply) {
    throw new Error("No reply generated");
  }

  // 🔒 PATCH 1 — Sanitize: remove any SEO/AEO terms that slipped through
  const reply = sanitizeRedditReply(rawReply);

  // 🔒 PATCH 4 — Stricter Reddit score
  const estimatedScore = estimateRedditScore(reply);

  console.log(`[reddit-agent] Generated reply (${reply.length} chars), score: ${estimatedScore}, brand: ${!!shouldMentionBrand}, link: ${!!shouldIncludeLink}`);

  return { 
    reply, 
    estimatedScore, 
    brandMentioned: !!shouldMentionBrand, 
    linkIncluded: !!shouldIncludeLink 
  };
}

// 🔒 PATCH 4 — Score Reddit plus strict
function estimateRedditScore(reply: string): number {
  let score = 40; // Lower base, harder to get high score

  // Positive signals
  if (reply.length >= 80 && reply.length <= 350) score += 20; // Ideal length
  if (reply.length >= 50 && reply.length < 80) score += 10; // Short but OK
  if (reply.endsWith("?")) score += 10; // Ends with question
  if (/\?[^?]*$/.test(reply)) score += 5; // Has question somewhere
  if (/(in my experience|what worked for me|we tried|I've found|personally)/i.test(reply)) score += 15; // Personal experience
  if (/(honestly|tbh|imo|imho|fwiw)/i.test(reply)) score += 5; // Reddit-native language
  if (!/http|www|\.com|\.io/i.test(reply)) score += 5; // No links

  // Negative signals (heavy penalties)
  if (reply.length > 500) score -= 25; // Way too long
  if (reply.length > 350) score -= 10; // Getting long
  if (/(recommend|check out|try using|you should use)/i.test(reply)) score -= 20; // Promotional
  if (/(tool|platform|service|software|app)/i.test(reply)) score -= 10; // Product mentions
  if (/(seo|aeo|ai search|optimization|algorithm)/i.test(reply)) score -= 25; // SEO jargon = death
  if (/(best|top|leading|innovative|revolutionary)/i.test(reply)) score -= 15; // Marketing speak
  if (/\n\n.*\n\n/g.test(reply)) score -= 5; // Too structured
  if (/^(here's|here are|let me|allow me)/i.test(reply)) score -= 10; // AI-ish opening
  if (/\d+%/.test(reply)) score -= 5; // Stats = suspicious

  return Math.max(10, Math.min(95, score));
}
