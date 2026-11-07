const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CMS detection from HTML content
function detectCMSFromContent(html: string, markdown: string): string {
  const content = (html + ' ' + markdown).toLowerCase();
  
  // WooCommerce (check first - it's WordPress + WooCommerce)
  if (content.includes('woocommerce') || content.includes('wc-ajax') || content.includes('wc-block')) {
    return 'WooCommerce';
  }
  
  // WordPress patterns
  if (
    content.includes('/wp-content/') ||
    content.includes('/wp-includes/') ||
    content.includes('wp-json') ||
    content.includes('wordpress.org') ||
    content.includes('wp-block')
  ) {
    return 'WordPress';
  }
  
  // Shopify patterns
  if (
    content.includes('cdn.shopify.com') ||
    content.includes('myshopify.com') ||
    content.includes('shopify.shop') ||
    content.includes('shopify-section')
  ) {
    return 'Shopify';
  }
  
  // Wix patterns
  if (
    content.includes('wix.com') ||
    content.includes('wixstatic.com') ||
    content.includes('wixsite.com') ||
    content.includes('_wix_browser_')
  ) {
    return 'Wix';
  }
  
  // Webflow patterns
  if (
    content.includes('webflow.com') ||
    content.includes('assets.webflow.com') ||
    content.includes('w-webflow')
  ) {
    return 'Webflow';
  }
  
  // Framer patterns
  if (
    content.includes('framer.website') ||
    content.includes('framer.app') ||
    content.includes('framerusercontent.com')
  ) {
    return 'Framer';
  }
  
  // Squarespace patterns
  if (
    content.includes('squarespace.com') ||
    content.includes('sqsp.net') ||
    content.includes('squarespace-cdn')
  ) {
    return 'Squarespace';
  }
  
  // Duda patterns
  if (content.includes('duda.co') || content.includes('dudaone.com')) {
    return 'Duda';
  }
  
  // BigCommerce patterns
  if (content.includes('bigcommerce.com') || content.includes('bcapp.dev')) {
    return 'BigCommerce';
  }
  
  // PrestaShop patterns
  if (content.includes('prestashop') || content.includes('/modules/ps_')) {
    return 'PrestaShop';
  }
  
  // Magento patterns
  if (content.includes('magento') || content.includes('mage/') || content.includes('varien')) {
    return 'Magento';
  }
  
  // Ghost patterns
  if (content.includes('ghost.org') || content.includes('ghost-portal')) {
    return 'Ghost';
  }
  
  // Drupal patterns
  if (content.includes('drupal.org') || content.includes('/sites/default/files')) {
    return 'Drupal';
  }
  
  // Joomla patterns
  if (content.includes('joomla') || content.includes('/media/com_')) {
    return 'Joomla';
  }
  
  // HubSpot patterns
  if (content.includes('hubspot.com') || content.includes('hs-scripts')) {
    return 'HubSpot';
  }
  
  return ''; // Unknown CMS
}

// IMPROVED: Fast language detection with weighted scoring to avoid FR/PT confusion
function detectLanguageFromContent(content: string, metaLang: string): string {
  if (!content || content.length < 100) {
    return metaLang || 'en';
  }
  
  const sampleText = content.substring(0, 5000).toLowerCase();
  
  // Language patterns with weights: [pattern, weight]
  // Higher weights for accented words and contractions (more reliable)
  const languagePatterns: Record<string, Array<[RegExp, number]>> = {
    // French - prioritize accents and contractions (very reliable)
    'fr': [
      // Common words (weight 1)
      [/\ble\b/g, 1], [/\bla\b/g, 1], [/\bles\b/g, 1], [/\bdu\b/g, 1], [/\bet\b/g, 1], 
      [/\bdes\b/g, 1], [/\bune\b/g, 1], [/\bpour\b/g, 1], [/\bvous\b/g, 1], [/\bnous\b/g, 1], 
      [/\bvotre\b/g, 1], [/\bnotre\b/g, 1], [/\bsur\b/g, 1], [/\bavec\b/g, 1], [/\bdans\b/g, 1], [/\bplus\b/g, 1],
      // Exclusively French words (weight 2)
      [/\bcette\b/g, 2], [/\bces\b/g, 2], [/\baux\b/g, 2], [/\bchez\b/g, 2], [/\bsont\b/g, 2], 
      [/\baussi\b/g, 2], [/\btrès\b/g, 2], [/\bcomme\b/g, 2], [/\btout\b/g, 2], [/\btoute\b/g, 2], 
      [/\bfaire\b/g, 2], [/\bpas\b/g, 2], [/\bvos\b/g, 2], [/\bsi\b/g, 1], [/\bou\b/g, 1],
      // French accented words (weight 3 - very reliable)
      [/\bêtre\b/g, 3], [/\bété\b/g, 3], [/\boù\b/g, 3], [/\bdéjà\b/g, 3], [/\baprès\b/g, 3], 
      [/\bmême\b/g, 3], [/\bà\b/g, 2], [/\bélégant/g, 3], [/\bqualité\b/g, 3], [/\blivré/g, 3],
      [/\bdécouvr/g, 3], [/\bprésent/g, 2], [/\bréalis/g, 3], [/\bcréa/g, 2],
      // French contractions (weight 4 - most reliable)
      [/\bc'est\b/g, 4], [/\bqu'il\b/g, 4], [/\bqu'elle\b/g, 4], [/\bn'est\b/g, 4], 
      [/\bj'ai\b/g, 4], [/\bl'un\b/g, 4], [/\bd'un\b/g, 4], [/\bd'une\b/g, 4],
      [/\bs'il\b/g, 4], [/\bqu'on\b/g, 4], [/\bl'on\b/g, 4], [/\bn'a\b/g, 4],
    ],
    // German
    'de': [
      [/\bder\b/g, 1], [/\bdie\b/g, 1], [/\bdas\b/g, 1], [/\bund\b/g, 1], [/\bist\b/g, 1], 
      [/\bein\b/g, 1], [/\beine\b/g, 1], [/\bfür\b/g, 2], [/\bmit\b/g, 1], [/\bauf\b/g, 1], 
      [/\bden\b/g, 1], [/\bdem\b/g, 1], [/\bnicht\b/g, 2], [/\bsich\b/g, 2], [/\bvon\b/g, 1], 
      [/\bzu\b/g, 1], [/\bauch\b/g, 2], [/\bwir\b/g, 2], [/\bsie\b/g, 1], [/\bihr\b/g, 1],
      [/\büber\b/g, 3], [/\bkönnen\b/g, 3], [/\bmöchten\b/g, 3],
    ],
    // Spanish
    'es': [
      [/\bel\b/g, 1], [/\blos\b/g, 1], [/\blas\b/g, 1], [/\bdel\b/g, 1], [/\by\b/g, 1], 
      [/\bque\b/g, 1], [/\ben\b/g, 1], [/\bpara\b/g, 1], [/\bcon\b/g, 1], [/\bpor\b/g, 1], 
      [/\bsu\b/g, 1], [/\bse\b/g, 1], [/\bes\b/g, 1], [/\bson\b/g, 1], [/\bcomo\b/g, 1], 
      [/\bnuestro\b/g, 2], [/\besta\b/g, 1], [/\beste\b/g, 1], [/\besos\b/g, 1], [/\besas\b/g, 1],
      [/\btambién\b/g, 3], [/\bestá\b/g, 2], [/\bsí\b/g, 2],
    ],
    // Italian
    'it': [
      [/\bil\b/g, 1], [/\bi\b/g, 1], [/\bdi\b/g, 1], [/\bche\b/g, 1], [/\bper\b/g, 1], 
      [/\bcon\b/g, 1], [/\bnon\b/g, 2], [/\bè\b/g, 2], [/\bsono\b/g, 2], [/\bdel\b/g, 1], 
      [/\bdella\b/g, 2], [/\bdei\b/g, 2], [/\bdelle\b/g, 2], [/\bsul\b/g, 1], [/\bnostro\b/g, 2], 
      [/\bquesto\b/g, 2], [/\bquella\b/g, 2], [/\bquesti\b/g, 2], [/\bqueste\b/g, 2], [/\bcome\b/g, 1],
      [/\bperché\b/g, 3], [/\bpiù\b/g, 3],
    ],
    // Portuguese - more specific words to avoid FR confusion
    'pt': [
      // Unique Portuguese words (weight 2-3)
      [/\bsão\b/g, 3], [/\bnão\b/g, 3], [/\bvocê\b/g, 3], [/\bestá\b/g, 2], [/\bnosso\b/g, 2], 
      [/\bnossa\b/g, 2], [/\btambém\b/g, 3], [/\bmuito\b/g, 2], [/\baqui\b/g, 2], [/\bpelo\b/g, 2], 
      [/\bpela\b/g, 2], [/\besse\b/g, 2], [/\bessa\b/g, 2], [/\bisso\b/g, 2], [/\bquando\b/g, 1], 
      [/\bseus\b/g, 2], [/\bsuas\b/g, 2], [/\btem\b/g, 1], [/\bser\b/g, 1], [/\bestar\b/g, 2],
      [/\bção\b/g, 3], [/\bões\b/g, 3], // Portuguese suffixes
      // Common words (weight 1) - removed ambiguous ones like "para", "com"
      [/\bo\b/g, 1], [/\bos\b/g, 1], [/\bas\b/g, 1], [/\bdo\b/g, 1], [/\bda\b/g, 1], 
      [/\bdos\b/g, 1], [/\bdas\b/g, 1], [/\bum\b/g, 1], [/\buma\b/g, 1], [/\bmais\b/g, 2],
    ],
    // English
    'en': [
      [/\bthe\b/g, 1], [/\ba\b/g, 1], [/\ban\b/g, 1], [/\band\b/g, 1], [/\bor\b/g, 1], 
      [/\bof\b/g, 1], [/\bto\b/g, 1], [/\bin\b/g, 1], [/\bfor\b/g, 1], [/\bwith\b/g, 1], 
      [/\bis\b/g, 1], [/\bare\b/g, 1], [/\byou\b/g, 1], [/\byour\b/g, 2], [/\bour\b/g, 1], 
      [/\bwe\b/g, 1], [/\bthis\b/g, 1], [/\bthat\b/g, 1], [/\bfrom\b/g, 1], [/\bby\b/g, 1],
      [/\bwould\b/g, 2], [/\bcould\b/g, 2], [/\bshould\b/g, 2], [/\btheir\b/g, 2],
    ],
  };
  
  let maxScore = 0;
  let detectedLang = 'en';
  
  for (const [lang, patterns] of Object.entries(languagePatterns)) {
    let score = 0;
    for (const [pattern, weight] of patterns) {
      const matches = sampleText.match(pattern);
      if (matches) {
        score += matches.length * weight;
      }
    }
    
    console.log(`[LANG-FAST] ${lang}: score=${score}`);
    
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }
  
  // Only return detected language if we have reasonable confidence
  if (maxScore < 15) {
    console.log('[LANG-FAST] Low confidence, using meta:', metaLang);
    return metaLang || 'en';
  }
  
  console.log('[LANG-FAST] Detected:', detectedLang, 'with score:', maxScore);
  return detectedLang;
}

// Fast local description extraction - no AI, instant
function extractDescriptionFast(markdown: string, metaDescription: string, brandName: string): string {
  // Try meta description first if it's clean
  if (metaDescription && metaDescription.length > 30 && metaDescription.length < 400) {
    const cleaned = cleanDescription(metaDescription);
    if (cleaned.length > 30) {
      console.log('[FAST] Using cleaned meta description');
      return cleaned;
    }
  }
  
  // Extract from markdown - find meaningful paragraphs
  if (markdown && markdown.length > 50) {
    // Remove common e-commerce noise
    const noisePatterns = [
      /\d+[,.]?\d*\s*€/g,           // Prices: 249,00 €
      /\d+%\s*(off|de réduction)?/gi, // Discounts
      /(promo|soldes?|sale|discount|ajouter au panier|add to cart)/gi,
      /\bx[234]\b/gi,               // Payment installments x3 x4
      /livraison|garantie|paiement/gi, // Shipping, warranty, payment
      /!\[[^\]]*\]\([^)]+\)/g,      // Markdown images
      /\[([^\]]+)\]\([^)]+\)/g,     // Markdown links -> text only
      /#{1,6}\s*/g,                 // Headers
      /\|[^|]+\|/g,                 // Tables
      /[-*]\s+/g,                   // List markers
    ];
    
    let cleanText = markdown;
    for (const pattern of noisePatterns) {
      cleanText = cleanText.replace(pattern, ' ');
    }
    
    // Split into sentences and filter
    const sentences = cleanText
      .split(/[.!?]+/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => {
        // Keep sentences that are meaningful
        return s.length > 20 && 
               s.length < 200 &&
               !/^\d+$/.test(s) &&
               !s.toLowerCase().includes('cookie') &&
               !s.toLowerCase().includes('aperçu') &&
               !s.toLowerCase().includes('choix des options');
      });
    
    if (sentences.length > 0) {
      // Take first 2-3 good sentences
      const description = sentences.slice(0, 3).join('. ').trim();
      if (description.length > 30) {
        console.log('[FAST] Extracted from markdown:', description.substring(0, 80));
        return description + '.';
      }
    }
  }
  
  // Ultimate fallback
  return `${brandName} propose des produits et services de qualité.`;
}

// Clean a description string
function cleanDescription(text: string): string {
  return text
    .replace(/\d+[,.]?\d*\s*€/g, '')
    .replace(/\d+%/g, '')
    .replace(/(promo|soldes?|sale|discount)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}


// Extract brand name from URL and content
function extractBrandName(url: string, title: string): string {
  // Generic page titles to ignore (in multiple languages)
  const genericTitles = [
    'accueil', 'home', 'homepage', 'inicio', 'startseite', 'pagina inicial',
    'bienvenue', 'welcome', 'willkommen', 'bienvenido', 'bem-vindo',
    'page d\'accueil', 'home page', 'main page'
  ];
  
  // Try to get from title first
  if (title) {
    const titleLower = title.toLowerCase().trim();
    
    // Skip if title is a generic page name
    if (genericTitles.includes(titleLower)) {
      console.log('[FAST] Skipping generic title:', title);
      // Fall through to domain extraction
    } else {
      // Common patterns: "Brand Name - Tagline" or "Brand Name | Description"
      const separators = [' - ', ' | ', ' – ', ' — ', ': '];
      for (const sep of separators) {
        if (title.includes(sep)) {
          const brandPart = title.split(sep)[0].trim();
          // Make sure extracted part is not generic
          if (!genericTitles.includes(brandPart.toLowerCase())) {
            return brandPart;
          }
        }
      }
      // If title is short enough and not generic, use it
      if (title.length < 30 && !genericTitles.includes(titleLower)) {
        return title;
      }
    }
  }
  
  // Fallback to domain - this is the most reliable for brand name
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const domain = urlObj.hostname.replace('www.', '');
    const name = domain.split('.')[0];
    // Capitalize first letter of each word, preserve case for acronyms
    return name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  } catch {
    return 'Your Brand';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try both keys in order: custom first, then connector
    const customKey = Deno.env.get('FIRECRAWL_API_KEY_CUSTOM');
    const connectorKey = Deno.env.get('FIRECRAWL_API_KEY');
    const keysToTry = [
      ...(customKey ? [{ key: customKey, label: 'CUSTOM' }] : []),
      ...(connectorKey ? [{ key: connectorKey, label: 'CONNECTOR' }] : []),
    ];

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('[FAST] Scraping URL:', formattedUrl);
    const startTime = Date.now();

    let firecrawlData: any = null;
    let firecrawlSuccess = false;

    // Try each Firecrawl key
    for (const { key, label } of keysToTry) {
      console.log(`[FAST] Trying API key: ${label}`);
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: formattedUrl,
            formats: ['markdown', 'html'],
            onlyMainContent: false,
            timeout: 8000,
          }),
        });

        const data = await response.json();
        const scrapeTime = Date.now() - startTime;
        console.log(`[FAST] Scrape with ${label} completed in ${scrapeTime}ms, status: ${response.status}`);

        if (response.ok && data.success) {
          firecrawlData = data;
          firecrawlSuccess = true;
          console.log(`[FAST] Success with ${label} key`);
          break;
        }

        // If insufficient credits, try next key
        if (response.status === 402 || (data.error && data.error.includes('Insufficient credits'))) {
          console.warn(`[FAST] ${label} key has insufficient credits, trying next...`);
          continue;
        }

        // Other error - still try next key
        console.warn(`[FAST] ${label} key failed: ${data.error}`);
      } catch (e) {
        console.warn(`[FAST] ${label} key threw error:`, e);
      }
    }

    // Fallback: use internal scraper if all Firecrawl keys failed
    if (!firecrawlSuccess) {
      console.log('[FAST] All Firecrawl keys failed, falling back to internal-scraper');
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const scraperRes = await fetch(`${supabaseUrl}/functions/v1/internal-scraper`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: formattedUrl, timeout: 8000 }),
        });

        if (scraperRes.ok) {
          const scraperData = await scraperRes.json();
          if (scraperData.success) {
            const d = scraperData.data;
            const language = detectLanguageFromContent(d.markdown || '', d.language || '');
            const brandName = d.brandName || extractBrandName(formattedUrl, d.title || '');
            const description = extractDescriptionFast(d.markdown || '', d.metaDescription || '', brandName);
            const cms = d.cms || detectCMSFromContent(d.html || '', d.markdown || '');

            const totalTime = Date.now() - startTime;
            console.log(`[FAST] Internal scraper fallback complete: ${totalTime}ms, lang=${language}, brand=${brandName}, cms=${cms}`);

            return new Response(
              JSON.stringify({
                success: true,
                data: { brandName, description, language, cms, sourceUrl: formattedUrl, favicon: d.favicon || '', ogImage: d.ogImage || '' }
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (scraperErr) {
        console.error('[FAST] Internal scraper fallback failed:', scraperErr);
      }

      // Ultimate fallback - return basic data from URL parsing
      const brandName = extractBrandName(formattedUrl, '');
      console.log('[FAST] Using URL-only fallback, brand:', brandName);
      return new Response(
        JSON.stringify({
          success: true,
          data: { brandName, description: '', language: 'en', cms: '', sourceUrl: formattedUrl }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = firecrawlData.data?.markdown || '';
    const rawHtml = firecrawlData.data?.html || firecrawlData.data?.rawHtml || '';
    const metadata = firecrawlData.data?.metadata || {};
    const title = metadata.title || '';
    const metaDescription = metadata.description || '';
    const metaLanguage = metadata.language || '';

    // Detect CMS from HTML content
    const cms = detectCMSFromContent(rawHtml, markdown);
    console.log('[FAST] CMS detected:', cms || 'unknown');

    // Fast local processing - ALL INSTANT (no AI)
    const language = detectLanguageFromContent(markdown, metaLanguage);
    const brandName = extractBrandName(formattedUrl, title);
    const description = extractDescriptionFast(markdown, metaDescription, brandName);
    
    const totalTime = Date.now() - startTime;
    console.log(`[FAST] Total processing complete: ${totalTime}ms`);
    console.log(`[FAST] Detected language: ${language}`);

    // NO audience extraction here - it's done by firecrawl-scrape in enrichment step
    // This makes the function MUCH faster (~1-2s instead of 4-5s)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          brandName,
          description,
          language,
          cms, // Include detected CMS
          sourceUrl: formattedUrl,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FAST] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
