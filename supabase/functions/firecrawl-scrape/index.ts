const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// IMPROVED: Content-based language detection with weighted scoring to avoid FR/PT confusion
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
    
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }
  
  // Only return detected language if we have reasonable confidence
  if (maxScore < 15) {
    console.log('[LANG] Low confidence, using meta:', metaLang);
    return metaLang || 'en';
  }
  
  console.log('[LANG] Detected:', detectedLang, 'with score:', maxScore);
  return detectedLang;
}

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

    // Validate URL format before processing
    const urlString = String(url).trim();
    
    // Quick validation: URL should be short and look like a domain
    if (urlString.length > 500 || urlString.includes('\n') || urlString.includes('  ')) {
      console.error('Invalid URL format - too long or contains invalid characters:', urlString.substring(0, 100));
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL format. Please provide a valid domain like example.com' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for valid URL pattern
    const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;
    if (!urlPattern.test(urlString)) {
      console.error('URL does not match valid pattern:', urlString.substring(0, 100));
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL format. Please provide a valid domain like example.com' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Priority: custom key > connector key
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY_CUSTOM') || Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('[SCRAPE] Using API key:', Deno.env.get('FIRECRAWL_API_KEY_CUSTOM') ? 'CUSTOM' : 'CONNECTOR');

    // Format URL
    let formattedUrl = urlString;
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const ownDomain = new URL(formattedUrl).hostname.replace('www.', '').toLowerCase();
    console.log('[SCRAPE] Starting fast analysis for:', ownDomain);

    const startTime = Date.now();

    // ============= STEP 1: Scrape + Competitors in PARALLEL =============
    const lovableApiKey = Deno.env.get('OPENROUTER_API_KEY');
    const dfLogin = Deno.env.get('DATAFORSEO_LOGIN');
    const dfPassword = Deno.env.get('DATAFORSEO_PASSWORD');

    // Try Firecrawl with both keys, fallback to basic fetch on 402
    let data: any = null;
    let firecrawlSuccess = false;
    const keysToTry = [
      { key: Deno.env.get('FIRECRAWL_API_KEY_CUSTOM'), label: 'CUSTOM' },
      { key: Deno.env.get('FIRECRAWL_API_KEY'), label: 'CONNECTOR' },
    ].filter(k => k.key);

    for (const { key, label } of keysToTry) {
      try {
        console.log('[SCRAPE] Trying Firecrawl with', label, 'key...');
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
            timeout: 15000,
          }),
        });

        if (response.ok) {
          data = await response.json();
          firecrawlSuccess = true;
          console.log('[SCRAPE] Firecrawl done in', Date.now() - startTime, 'ms with', label);
          break;
        }

        const errBody = await response.json().catch(() => ({}));
        console.warn('[SCRAPE] Firecrawl', label, 'failed:', response.status, errBody.error || '');

        if (response.status !== 402) {
          // Non-credit error, don't try other keys
          break;
        }
      } catch (e) {
        console.warn('[SCRAPE] Firecrawl', label, 'exception:', e);
      }
    }

    // Fallback: use internal scraper if Firecrawl failed (402 credits exhausted)
    if (!firecrawlSuccess) {
      console.log('[SCRAPE] All Firecrawl keys exhausted, falling back to internal-scraper...');
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const scraperRes = await fetch(`${supabaseUrl}/functions/v1/internal-scraper`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: formattedUrl, timeout: 12000 }),
        });

        if (scraperRes.ok) {
          const scraperData = await scraperRes.json();
          if (scraperData.success) {
            const d = scraperData.data;
            data = {
              data: {
                markdown: d.markdown || '',
                html: d.html || '',
                metadata: {
                  title: d.title || '',
                  description: d.metaDescription || '',
                  language: d.language || '',
                  ogImage: d.ogImage || '',
                },
                links: d.links || [],
              },
            };
            console.log('[SCRAPE] Internal scraper successful, extracted', (d.markdown || '').length, 'chars, favicon:', d.favicon);
          }
        } else {
          console.error('[SCRAPE] Internal scraper failed:', scraperRes.status);
        }
      } catch (scraperErr) {
        console.error('[SCRAPE] Internal scraper error:', scraperErr);
      }
    }

    // If everything failed, return minimal data from URL parsing
    if (!data) {
      console.log('[SCRAPE] All methods failed, returning URL-based data');
      const domainName = ownDomain.split('.')[0];
      const brandFallback = domainName.charAt(0).toUpperCase() + domainName.slice(1);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            brandName: brandFallback,
            description: '',
            language: 'en',
            audiences: ['business owners', 'professionals', 'decision makers'],
            competitors: [],
            keywords: [],
            cms: '',
            qaSeo: [],
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract metadata
    const metadata = data.data?.metadata || {};
    const markdown = data.data?.markdown || '';
    const rawHtml = data.data?.html || data.data?.rawHtml || '';
    const title = metadata.title || '';
    let description = metadata.description || metadata.ogDescription || '';
    
    // Detect CMS from HTML content
    const cms = detectCMSFromContent(rawHtml, markdown);
    console.log('[SCRAPE] CMS detected:', cms || 'unknown');
    
    // Detect language from content (more reliable than metadata)
    // Handle metadata.language being either a string or an array
    const rawLang = metadata.language;
    const metaLang = (Array.isArray(rawLang) ? rawLang[0] : rawLang)?.substring?.(0, 2) || 'en';
    const language = detectLanguageFromContent(markdown, metaLang);
    console.log('[SCRAPE] Language: meta=' + metaLang + ', detected=' + language);

    // Extract brand name
    let brandName = title.split('|')[0].split('-')[0].split('—')[0].split(':')[0].trim();
    if (!brandName || brandName.length < 2) {
      brandName = ownDomain.split('.')[0];
      brandName = brandName.charAt(0).toUpperCase() + brandName.slice(1);
    }

    // Clean description
    const cleanMarkdown = (text: string): string => {
      return text
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/[^\s)]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    let enrichedDescription = cleanMarkdown(description);
    if (enrichedDescription.length < 100) {
      const paragraphs = markdown.substring(0, 3000).split(/\n\n+/).filter((p: string) => 
        p.length > 50 && !p.startsWith('#') && !p.startsWith('!')
      );
      if (paragraphs.length > 0) {
        enrichedDescription = cleanMarkdown(paragraphs[0]).substring(0, 400);
      }
    }

    // ============= STEP 2: Extract Keywords FIRST (needed for competitor detection) =============
    // Use a sampled context from the whole page (top + middle + bottom) so keywords reflect the full scroll.
    const midStart = Math.max(0, Math.floor(markdown.length / 2) - 1500);
    const midEnd = Math.min(markdown.length, midStart + 3000);

    const contentPreview = [
      markdown.substring(0, 3000),
      markdown.substring(midStart, midEnd),
      markdown.substring(Math.max(0, markdown.length - 3000)),
    ]
      .filter(Boolean)
      .join("\n\n")
      .substring(0, 9000);

    // Extract keywords first - they'll be used for AI competitor fallback
    const keywordsPromise = lovableApiKey
      ? extractKeywordsFast(enrichedDescription, contentPreview, brandName, language, lovableApiKey)
      : Promise.resolve([]);

    // ============= STEP 3: Audiences + Keywords in PARALLEL =============
    const [audiences, keywords] = await Promise.all([
      lovableApiKey ? extractAudiencesFast(enrichedDescription, contentPreview, language, lovableApiKey) : Promise.resolve([]),
      keywordsPromise,
    ]);

    // ============= STEP 4: Competitors detection with multi-source + scoring =============
    let rawCompetitors: string[] = [];
    
    // Get business type EARLY for contextual filtering (pass keywords for better niche detection)
    const businessTypeQuery = lovableApiKey 
      ? await detectBusinessType(enrichedDescription, contentPreview, brandName, language, lovableApiKey, keywords)
      : enrichedDescription;
    
    console.log('[COMPETITORS] Business context for filtering:', businessTypeQuery.substring(0, 100));
    
    // SOURCE 1: DataForSEO Domain Competitors API
    if (dfLogin && dfPassword) {
      rawCompetitors = await fetchCompetitorsFast(ownDomain, dfLogin, dfPassword, language, businessTypeQuery);
      console.log('[COMPETITORS] Source 1 (Domain API):', rawCompetitors.length, 'results');
    }
    
    // SOURCE 2: DataForSEO SERP-based detection (if Source 1 returned < 3)
    if (rawCompetitors.length < 3 && dfLogin && dfPassword && keywords.length > 0) {
      console.log('[COMPETITORS] Trying SERP-based detection...');
      const serpCompetitors = await fetchCompetitorsFromSERP(keywords, ownDomain, dfLogin, dfPassword, language, businessTypeQuery);
      
      // Merge unique domains
      for (const c of serpCompetitors) {
        if (!rawCompetitors.includes(c)) rawCompetitors.push(c);
      }
      console.log('[COMPETITORS] Source 2 (SERP API):', serpCompetitors.length, 'new, total:', rawCompetitors.length);
    }
    
    // SOURCE 3: Related Keywords expansion for niche competitors (always try if we have keywords)
    if (dfLogin && dfPassword && keywords.length > 0 && rawCompetitors.length < 5) {
      console.log('[COMPETITORS] Trying Related Keywords expansion...');
      const nicheCompetitors = await fetchCompetitorsViaRelatedKeywords(keywords, ownDomain, dfLogin, dfPassword, language, businessTypeQuery);
      
      // Merge unique domains
      for (const c of nicheCompetitors) {
        if (!rawCompetitors.includes(c)) rawCompetitors.push(c);
      }
      console.log('[COMPETITORS] Source 3 (Related Keywords):', nicheCompetitors.length, 'new, total:', rawCompetitors.length);
    }
    
    // SOURCE 4: Google Search via Firecrawl (final fallback)
    if (rawCompetitors.length < 3 && apiKey) {
      console.log('[COMPETITORS] Using AI-powered Google Search fallback...');
      const googleCompetitors = await findCompetitorsViaGoogleSearch(enrichedDescription, brandName, ownDomain, language, apiKey, keywords, contentPreview, businessTypeQuery);
      
      for (const c of googleCompetitors) {
        if (!rawCompetitors.includes(c)) rawCompetitors.push(c);
      }
      console.log('[COMPETITORS] Source 4 (Google Search):', googleCompetitors.length, 'new, total:', rawCompetitors.length);
    }
    
    // SOURCE 5: Pure AI knowledge fallback (when ALL APIs fail)
    if (rawCompetitors.length < 2 && lovableApiKey) {
      console.log('[COMPETITORS] All APIs failed, using AI knowledge fallback...');
      const aiCompetitors = await findCompetitorsViaAI(enrichedDescription, brandName, ownDomain, language, lovableApiKey, keywords);
      
      for (const c of aiCompetitors) {
        if (!rawCompetitors.includes(c)) rawCompetitors.push(c);
      }
      console.log('[COMPETITORS] Source 5 (AI Knowledge):', aiCompetitors.length, 'new, total:', rawCompetitors.length);
    }
    
    // SCORING: Score competitors by business similarity
    let competitors: string[] = rawCompetitors.slice(0, 8); // Max 8 for scoring
    
    if (lovableApiKey && competitors.length > 0 && (enrichedDescription || businessTypeQuery)) {
      console.log('[COMPETITORS] Scoring by business similarity...');
      const scoredCompetitors = await scoreCompetitorSimilarity(
        competitors,
        enrichedDescription,
        businessTypeQuery,
        language,
        lovableApiKey
      );
      
      // Filter out low-scoring competitors (< 50) and sort by score descending - stricter to exclude media
      competitors = scoredCompetitors
        .filter(c => c.score >= 50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4) // Maximum 4 high-quality competitors
        .map(c => c.domain);
      
      console.log('[COMPETITORS] After scoring:', competitors.length, 'high-quality competitors');
    } else {
      competitors = competitors.slice(0, 4); // Maximum 4 competitors
    }

    console.log('[SCRAPE] Total time:', Date.now() - startTime, 'ms');
    console.log('[SCRAPE] Found', audiences.length, 'audiences,', competitors.length, 'competitors,', keywords.length, 'keywords');

    // ============= STEP 5: Generate Q&A + SEO Titles from Competitors =============
    const qaSeo = lovableApiKey && competitors.length >= 2 && keywords.length >= 5
      ? await generateQaAndSeoTitlesFromCompetitors(competitors, keywords, language, lovableApiKey)
      : [];
    
    console.log('[SCRAPE] Generated', qaSeo.length, 'Q&A items');
    console.log('[SCRAPE] Final time:', Date.now() - startTime, 'ms');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          brandName,
          description: enrichedDescription,
          language,
          audiences: audiences.length >= 2 ? audiences : ['business owners', 'professionals', 'decision makers'],
          competitors,
          keywords: keywords.length >= 5 ? keywords : [],
          cms,
          qaSeo,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Scrape error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Fast audience extraction with timeout
async function extractAudiencesFast(description: string, content: string, language: string, apiKey: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s max

    const langInstruction = language === 'fr' ? 'Réponds en FRANÇAIS.' : 'Respond in ENGLISH.';
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free', // Fastest model
        messages: [{
          role: 'user',
          content: `Extract 4 specific target audiences for this business. ${langInstruction}
Description: ${description}
Content: ${content.substring(0, 1000)}
Return ONLY a JSON array: ["audience1", "audience2", "audience3", "audience4"]`
        }],
        temperature: 0.2,
        max_tokens: 150,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);
    
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed.slice(0, 5);
    }
    return [];
  } catch (e) {
    console.error('[AUDIENCES] Error:', e);
    return [];
  }
}

// AI-powered business type detection for accurate competitor search
async function detectBusinessType(
  description: string, 
  content: string, 
  brandName: string, 
  language: string, 
  apiKey: string,
  keywords: Array<{keyword: string, intent: string}> = []
): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // Extract top keywords to help AI understand the niche better
    const topKeywords = keywords
      .filter(k => k.intent === 'commercial' || k.intent === 'transactional')
      .slice(0, 5)
      .map(k => k.keyword)
      .join(', ');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [{
          role: 'user',
          content: `Analyze this business and return a SHORT search query (max 6 words) to find similar competitors.

Business: ${brandName}
Description: ${description}
${topKeywords ? `Top keywords: ${topKeywords}` : ''}
Content sample: ${content.substring(0, 1200)}

Rules:
- USE THE KEYWORDS to understand the exact niche (e.g., "meubles occasion" = used furniture marketplace)
- Identify the EXACT business type (e.g., "marketplace vente meubles occasion" NOT "furniture store")
- Return a query that would find DIRECT TRANSACTIONAL competitors (sites where users can BUY/SELL)
- Language: ${language === 'fr' ? 'FRENCH' : 'ENGLISH'}
- Include "sites" or "plateformes" in the query
- Be SPECIFIC about the business model (marketplace C2C, e-commerce, etc.)
- NEVER include news/media/blog terms

Return ONLY the search query, nothing else. Example: "plateformes vente meubles occasion France"`
        }],
        temperature: 0.1,
        max_tokens: 50,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return '';

    const data = await response.json();
    const query = data.choices?.[0]?.message?.content?.trim() || '';
    console.log('[COMPETITORS] AI detected business query:', query);
    return query;
  } catch (e) {
    console.error('[COMPETITORS] Business type detection error:', e);
    return '';
  }
}

// Find competitors via Google Search using Firecrawl - KEYWORD-FIRST approach
// Uses actual transactional keywords like "meubles occasion" for precise results
async function findCompetitorsViaGoogleSearch(
  description: string,
  brandName: string,
  domain: string,
  language: string,
  firecrawlApiKey: string,
  extractedKeywords: Array<{keyword: string, intent: string}> = [],
  contentSample: string = '',
  businessContext: string = ''
): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // Build diverse search queries for maximum coverage
    const transactionalKeywords = extractedKeywords
      .filter(k => k.intent === 'transactional' || k.intent === 'commercial')
      .slice(0, 3)
      .map(k => k.keyword);
    
    const searchQueries: string[] = [];
    
    // PRIORITY 1: Use businessContext (AI-generated query like "sites audit visibilité IA")
    // This is the MOST reliable because AI understands the business model
    if (businessContext && businessContext.length > 5 && businessContext.length < 100) {
      searchQueries.push(businessContext);
      console.log('[COMPETITORS] Added business context query:', businessContext);
    }
    
    // PRIORITY 2: "alternatives à [brand]" query - finds direct competitors
    const cleanBrand = brandName.split('–')[0].split('-')[0].split('|')[0].trim();
    if (cleanBrand && cleanBrand.length > 2 && cleanBrand.length < 40) {
      const altQuery = language === 'fr'
        ? `alternatives à ${cleanBrand}`
        : `alternatives to ${cleanBrand}`;
      searchQueries.push(altQuery);
      console.log('[COMPETITORS] Added alternatives query:', altQuery);
    }
    
    // PRIORITY 3: Transactional keywords
    if (transactionalKeywords.length > 0 && !searchQueries.some(q => q === transactionalKeywords[0])) {
      searchQueries.push(transactionalKeywords[0]);
    }
    
    // Ensure at least one query
    if (searchQueries.length === 0) {
      const fallback = language === 'fr' ? `sites comme ${cleanBrand}` : `sites like ${cleanBrand}`;
      searchQueries.push(fallback);
    }
    
    console.log('[COMPETITORS] Search queries:', searchQueries);

    // Execute searches in parallel
    const searchPromises = searchQueries.map(async (query) => {
      const response = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 12,
          lang: language === 'fr' ? 'fr' : 'en',
          country: language === 'fr' ? 'FR' : 'US',
        }),
        signal: controller.signal,
      });
      
      if (!response.ok) return [];
      const data = await response.json();
      return data.success && data.data ? data.data : [];
    });
    
    const searchResults = await Promise.all(searchPromises);
    const allResults = searchResults.flat();

    clearTimeout(timeout);

    if (allResults.length === 0) {
      console.log('[COMPETITORS] No search results from Firecrawl');
      return [];
    }
    
    console.log('[COMPETITORS] Total search results:', allResults.length);

    const ownDomainBase = domain.split('.')[0].toLowerCase();
    const competitors: string[] = [];
    const seenDomains = new Set<string>();

    // === SEO METADATA ANALYSIS ===
    // Analyze title + description to identify competitors vs media/blog
    const SERVICE_SIGNALS = [
      // SaaS/service signals
      'audit', 'tool', 'outil', 'plateforme', 'platform', 'solution', 'software', 'logiciel',
      'saas', 'app', 'dashboard', 'api', 'service', 'agence', 'agency', 'consultant',
      'optimize', 'optimiser', 'analyze', 'analyser', 'score', 'report', 'rapport',
      'pricing', 'tarif', 'prix', 'plan', 'essai gratuit', 'free trial', 'demo', 'démo',
      'sign up', 'inscription', 'commencer', 'get started', 'subscribe', 'abonnement',
    ];
    
    const ECOMMERCE_SIGNALS = [
      'achat', 'acheter', 'vente', 'vendre', 'occasion', 'annonces', 'petites annonces',
      'dépôt-vente', 'depot-vente', 'seconde main', 'second hand', 'prix', 'gratuit',
      'livraison', 'boutique', 'magasin', 'marketplace', 'vendeur', 'particulier',
      'buy', 'sell', 'sale', 'shop', 'store', 'marketplace', 'listing', 'classified',
      'deals', 'discount', 'price', 'shipping', 'delivery', 'seller', 'buyer',
      'annonce', 'offre', 'promo', 'soldes', 'destockage', 'occasion certifié',
    ];
    
    const MEDIA_SIGNALS = [
      'article', 'blog', 'actualité', 'actualites', 'news', 'magazine', 'journal',
      'rédaction', 'redaction', 'info', 'infos', 'presse', 'média', 'medias',
      'reportage', 'édito', 'edito', 'chronique', 'interview', 'enquête',
      'bons plans', 'bon plan', 'conseils', 'astuces', 'top ', 'meilleurs',
      'notre sélection', 'on vous dit', 'découvrez', 'voici', 'nos coups de coeur',
      'blog', 'news', 'magazine', 'editorial', 'report', 'review',
      'best of', 'top picks', 'guide to', 'tips', 'tricks', 'how to',
    ];
    
    for (const result of allResults) {
      try {
        const url = result.url || result.sourceURL || '';
        if (!url) continue;
        
        const urlObj = new URL(url);
        const resultDomain = urlObj.hostname.replace('www.', '').toLowerCase();
        
        if (isBlockedDomain(resultDomain, businessContext)) continue;
        if (resultDomain.includes(ownDomainBase)) continue;
        if (seenDomains.has(resultDomain)) continue;
        if (resultDomain.endsWith('.gov') || resultDomain.endsWith('.edu')) continue;
        
        const domainWords = resultDomain.split('.')[0].toLowerCase();
        if (['blog', 'news', 'review', 'compare', 'best', 'top', 'list'].some(w => domainWords.includes(w))) continue;
        
        const title = (result.title || '').toLowerCase();
        const desc = (result.description || '').toLowerCase();
        const seoText = `${title} ${desc}`;
        
        const ecommerceScore = ECOMMERCE_SIGNALS.filter(signal => seoText.includes(signal)).length;
        const serviceScore = SERVICE_SIGNALS.filter(signal => seoText.includes(signal)).length;
        const mediaScore = MEDIA_SIGNALS.filter(signal => seoText.includes(signal)).length;
        const businessScore = ecommerceScore + serviceScore;
        
        // Only skip if CLEARLY media (high media signals AND low business signals)
        if (mediaScore >= 3 && businessScore === 0) {
          console.log(`[COMPETITORS] Skipping pure media: ${resultDomain} (media=${mediaScore}, biz=${businessScore})`);
          continue;
        }
        
        seenDomains.add(resultDomain);
        competitors.push(resultDomain);
        
        if (competitors.length >= 10) break;
      } catch {
        // Invalid URL, skip
      }
    }

    console.log('[COMPETITORS] Google search found:', competitors);
    return competitors;

  } catch (e) {
    console.error('[COMPETITORS] Google search error:', e);
    return [];
  }
}

// AI-based keyword extraction for AEO
async function extractKeywordsFast(description: string, content: string, brandName: string, language: string, apiKey: string): Promise<Array<{keyword: string, intent: string}>> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const langInstruction = language === 'fr'
      ? 'Génère des mots-clés en FRANÇAIS adaptés au marché francophone.'
      : 'Generate keywords in ENGLISH.';

    // Content is already sampled across the page; keep it reasonably sized for speed.
    const contentForModel = content.substring(0, 5000);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [{
          role: 'user',
          content: `Extract 18-22 SEO/AEO keywords for this business. ${langInstruction}

Business: ${brandName}
Description: ${description}
Page content (sampled from top/middle/bottom): ${contentForModel}

Rules:
- Include a mix of:
  - Head terms (1-2 words)
  - Long-tail keywords (3-6 words)
  - Question-based keywords (how/what/why/when)
  - Comparison keywords (vs, alternative, best)
  - Intent keywords (buy, price, review, tutorial)
- Avoid generic words ("home", "welcome", etc.)
- Classify each keyword intent: informational, transactional, navigational, commercial

Return ONLY a JSON array:
[{"keyword":"...","intent":"informational"}, ...]`
        }],
        temperature: 0.4,
        max_tokens: 700,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);

    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        console.log('[KEYWORDS] Extracted:', parsed.length, 'keywords');
        return parsed.slice(0, 22);
      }
    }
    return [];
  } catch (e) {
    console.error('[KEYWORDS] Error:', e);
    return [];
  }
}

// Location codes for DataForSEO based on language
function getLocationCode(language: string): number {
  const locations: Record<string, number> = {
    'fr': 2250,  // France
    'de': 2276,  // Germany
    'es': 2724,  // Spain
    'it': 2380,  // Italy
    'pt': 2076,  // Brazil (Portuguese)
    'en': 2840,  // USA (default for English)
  };
  return locations[language] || 2840;
}

// Blocked domains list - comprehensive
const BLOCKED_DOMAINS = new Set([
  // Social media
  'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 
  'youtube.com', 'tiktok.com', 'pinterest.com', 'x.com',
  // Search engines
  'google.com', 'google.fr', 'google.de', 'bing.com', 'yahoo.com',
  // Marketplaces (only generic ones like Amazon)
  'amazon.com', 'amazon.fr', 'amazon.de', 'ebay.com', 'ebay.fr', 'etsy.com',
  // Generic platforms
  'shopify.com', 'wix.com', 'wordpress.com', 'wordpress.org', 'squarespace.com', 
  'webflow.com', 'medium.com', 'substack.com', 'notion.so', 'canva.com',
  // Review/directory sites
  'trustpilot.com', 'yelp.com', 'tripadvisor.com', 'pagesjaunes.fr',
  'g2.com', 'capterra.com', 'getapp.com', 'softwareadvice.com',
  // Wikipedia
  'wikipedia.org', 'wikimedia.org',
  // Tech sites
  'reddit.com', 'quora.com', 'stackoverflow.com', 'github.com',
  'techcrunch.com', 'producthunt.com', 'crunchbase.com',
  // App stores
  'apps.shopify.com', 'play.google.com', 'apps.apple.com',
  // French retail (NOT second-hand)
  'cdiscount.com', 'fnac.com', 'darty.com',
]);

// Second-hand / C2C marketplaces - these should be ALLOWED for relevant businesses
const SECOND_HAND_MARKETPLACES = new Set([
  'leboncoin.fr', 'vinted.fr', 'vinted.com', 'selency.com', 'videdressing.com',
  'vestiaire-collective.com', 'backmarket.fr', 'backmarket.com', 
  'rebuy.fr', 'momox.fr', 'rakuten.fr', 'label-emmaus.co',
  'paruvendu.fr', 'trocvestiaire.com', 'depop.com',
]);

// BLOCKED: Media, news, magazines, blogs that appear in SERP but are NOT competitors
const BLOCKED_MEDIA_DOMAINS = new Set([
  // Médias français écologie/lifestyle
  'linfodurable.fr', 'madmoizelle.com', 'lepoint.fr', 'lefigaro.fr',
  'lemonde.fr', 'liberation.fr', 'lexpress.fr', '20minutes.fr',
  'huffingtonpost.fr', 'bfmtv.com', 'tf1info.fr', 'francetvinfo.fr',
  'rtl.fr', 'europe1.fr', 'rmc.bfmtv.com', 'leparisien.fr',
  // Blogs déco/lifestyle
  'deco.fr', 'cotemaison.fr', 'elle.fr', 'marieclaire.fr',
  'femmeactuelle.fr', 'aufeminin.com', 'journaldesfemmes.fr',
  'maison-travaux.fr', 'maisonapart.com', 'houzz.fr',
  // Magazine/guide généralistes
  'consoglobe.com', 'radins.com', 'frenchweb.fr', 'maddyness.com',
  'debongout-paris.com', 'neonmag.fr', 'konbini.com', 'melty.fr',
  // English media
  'forbes.com', 'businessinsider.com', 'techcrunch.com', 'theguardian.com',
  'nytimes.com', 'washingtonpost.com', 'bbc.com', 'cnn.com',
]);

// Detect if the business context indicates a second-hand / C2C marketplace
function isSecondHandBusiness(businessContext: string): boolean {
  if (!businessContext) return false;
  const lowerContext = businessContext.toLowerCase();
  return /occasion|seconde.?main|vente.?entre.?particuliers|marketplace.?c2c|vendre.*(meubles|objets|vêtements)|achat.?revente|brocante|dépôt.?vente|reconditionné|second.?hand|resale|peer.?to.?peer|used.?items|classifieds|preloved/i.test(lowerContext);
}

function isBlockedDomain(domain: string, businessContext: string = ''): boolean {
  const lower = domain.toLowerCase();
  
  // ALWAYS block media/news sites regardless of business context
  if (BLOCKED_MEDIA_DOMAINS.has(lower)) {
    console.log('[FILTER] Blocking media/blog site:', lower);
    return true;
  }
  
  // If it's a second-hand marketplace AND the business is in second-hand vertical, ALLOW it
  if (SECOND_HAND_MARKETPLACES.has(lower) && isSecondHandBusiness(businessContext)) {
    console.log('[FILTER] Allowing second-hand marketplace for this vertical:', lower);
    return false; // NOT blocked = valid competitor
  }
  
  // If it's a second-hand marketplace but business is NOT second-hand, block it
  if (SECOND_HAND_MARKETPLACES.has(lower)) {
    return true;
  }
  
  // Standard blocking logic
  if (BLOCKED_DOMAINS.has(lower)) return true;
  for (const blocked of BLOCKED_DOMAINS) {
    if (lower.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

// ============= BUSINESS SIMILARITY SCORING =============
// Score competitors by how similar their business type is to ours
interface CompetitorWithScore {
  domain: string;
  score: number;
  intersections?: number;
  avgPosition?: number;
}

async function scoreCompetitorSimilarity(
  competitors: string[],
  businessDescription: string,
  businessType: string,
  language: string,
  apiKey: string
): Promise<CompetitorWithScore[]> {
  if (!competitors.length || !apiKey) return competitors.map(d => ({ domain: d, score: 50 }));
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const langInstruction = language === 'fr' ? 'Réponds en JSON.' : 'Respond in JSON.';
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [{
          role: 'user',
          content: `Score each competitor by business similarity (0-100). ${langInstruction}

Our business: ${businessDescription.substring(0, 500)}
Business type/niche: ${businessType}

Competitors to score:
${competitors.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Scoring rules:
- 90-100: Same business model AND same niche (direct competitor)
- 70-89: Same business model OR same niche  
- 50-69: Related industry but different model
- 30-49: Tangentially related
- 0-29: NOT a competitor (news sites, blogs, magazines, directories, media portals)

CRITICAL: News sites, magazines, content portals, and media outlets are NEVER competitors for e-commerce/marketplace businesses. Score them 0-20 maximum. Examples: linfodurable.fr, madmoizelle.com, 20minutes.fr = score 0-15.

Return ONLY JSON array: [{"domain":"...","score":85,"reason":"..."}]`
        }],
        temperature: 0.1,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return competitors.map(d => ({ domain: d, score: 50 }));

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);

    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        console.log('[SCORING] AI similarity scores:', parsed.map((p: any) => `${p.domain}:${p.score}`).join(', '));
        return parsed.map((p: any) => ({
          domain: p.domain,
          score: typeof p.score === 'number' ? p.score : 50,
        }));
      }
    }
    
    return competitors.map(d => ({ domain: d, score: 50 }));
  } catch (e) {
    console.error('[SCORING] Error:', e);
    return competitors.map(d => ({ domain: d, score: 50 }));
  }
}

// ============= RELATED KEYWORDS DATAFORSEO =============
// Discover niche competitors via related keywords expansion
async function fetchCompetitorsViaRelatedKeywords(
  keywords: Array<{keyword: string, intent: string}>,
  ownDomain: string,
  login: string,
  password: string,
  language: string,
  businessContext: string = ''
): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const auth = btoa(`${login}:${password}`);
    const locationCode = getLocationCode(language);
    const languageCode = language === 'fr' ? 'fr' : language === 'de' ? 'de' : language === 'es' ? 'es' : 'en';
    
    // Use top keywords for related expansion
    const seedKeyword = keywords
      .filter(k => k.intent === 'commercial' || k.intent === 'transactional')
      .slice(0, 1)
      .map(k => k.keyword)[0] || keywords[0]?.keyword;
    
    if (!seedKeyword) {
      console.log('[RELATED-KW] No seed keyword available');
      return [];
    }
    
    console.log('[RELATED-KW] Fetching related keywords for:', seedKeyword);
    
    const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        keyword: seedKeyword,
        location_code: locationCode,
        language_code: languageCode,
        depth: 2,
        limit: 30,
      }]),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();
    
    if (data.status_code !== 20000 || !data.tasks?.[0]?.result?.[0]?.items) {
      console.log('[RELATED-KW] No results:', data.status_message || 'empty');
      return [];
    }

    // Extract related keywords
    const relatedKeywords = data.tasks[0].result[0].items
      .filter((item: any) => item.keyword_data?.keyword)
      .map((item: any) => item.keyword_data.keyword)
      .slice(0, 5);
    
    if (relatedKeywords.length === 0) {
      console.log('[RELATED-KW] No related keywords found');
      return [];
    }
    
    console.log('[RELATED-KW] Found related keywords:', relatedKeywords);
    
    // Now query SERP for these related keywords to find niche competitors
    const serpResponse = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(relatedKeywords.slice(0, 3).map((kw: string) => ({
        keyword: kw,
        location_code: locationCode,
        language_code: languageCode,
        depth: 15,
      }))),
    });

    const serpData = await serpResponse.json();
    
    if (serpData.status_code !== 20000 || !serpData.tasks) {
      console.log('[RELATED-KW] SERP error:', serpData.status_message || 'empty');
      return [];
    }

    const ownDomainBase = ownDomain.split('.')[0].toLowerCase();
    const domainCounts = new Map<string, number>();
    
    // Aggregate domains from SERP results
    for (const task of serpData.tasks) {
      if (!task.result?.[0]?.items) continue;
      
      for (const item of task.result[0].items) {
        if (item.type !== 'organic') continue;
        
        const domain = item.domain?.toLowerCase();
        if (!domain) continue;
        if (domain.includes(ownDomainBase) || ownDomainBase.includes(domain.split('.')[0])) continue;
        if (isBlockedDomain(domain, businessContext)) continue;
        
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      }
    }
    
    // Return domains that appear in multiple keyword SERPs (more likely to be niche competitors)
    const competitors = [...domainCounts.entries()]
      .filter(([_, count]) => count >= 2) // Appears in at least 2 keyword SERPs
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain]) => domain);
    
    console.log('[RELATED-KW] Niche competitors found:', competitors);
    return competitors;

  } catch (e) {
    console.error('[RELATED-KW] Error:', e);
    return [];
  }
}

// Fast competitors fetch - with proper location based on language
async function fetchCompetitorsFast(domain: string, login: string, password: string, language: string, businessContext: string = ''): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const auth = btoa(`${login}:${password}`);
    const locationCode = getLocationCode(language);
    const languageCode = language === 'fr' ? 'fr' : language === 'de' ? 'de' : language === 'es' ? 'es' : 'en';
    
    console.log('[COMPETITORS] Using DataForSEO with location:', locationCode, 'language:', languageCode);
    
    const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        target: domain,
        location_code: locationCode,
        language_code: languageCode,
        limit: 20, // Get more to filter
        filters: ["intersections", ">", 0] // Any intersection counts
      }]),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();
    
    if (data.status_code !== 20000 || !data.tasks?.[0]?.result?.[0]?.items) {
      console.log('[COMPETITORS] No results from DataForSEO domain API:', data.status_message || 'empty');
      return [];
    }

    const ownDomainBase = domain.split('.')[0].toLowerCase();
    
    const competitors = data.tasks[0].result[0].items
      .map((item: any) => item.domain)
      .filter((d: string) => {
        if (!d) return false;
        const lower = d.toLowerCase();
        // Skip own domain
        if (lower.includes(ownDomainBase) || ownDomainBase.includes(lower.split('.')[0])) return false;
        // Skip blocked domains (with business context for smart filtering)
        if (isBlockedDomain(lower, businessContext)) return false;
        return true;
      })
      .slice(0, 6);

    console.log('[COMPETITORS] Domain API found:', competitors);
    return competitors;

  } catch (e) {
    console.error('[COMPETITORS] Domain API error:', e);
    return [];
  }
}

// NEW: Fetch competitors from SERP based on keywords
async function fetchCompetitorsFromSERP(
  keywords: Array<{keyword: string, intent: string}>,
  ownDomain: string,
  login: string,
  password: string,
  language: string,
  businessContext: string = ''
): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const auth = btoa(`${login}:${password}`);
    const locationCode = getLocationCode(language);
    const languageCode = language === 'fr' ? 'fr' : language === 'de' ? 'de' : language === 'es' ? 'es' : 'en';
    
    // Use the top commercial/transactional keywords for SERP analysis
    const topKeywords = keywords
      .filter(k => k.intent === 'commercial' || k.intent === 'transactional')
      .slice(0, 3)
      .map(k => k.keyword);
    
    if (topKeywords.length === 0) {
      // Fallback to any keywords
      topKeywords.push(...keywords.slice(0, 3).map(k => k.keyword));
    }
    
    if (topKeywords.length === 0) {
      console.log('[COMPETITORS] No keywords for SERP analysis');
      return [];
    }
    
    console.log('[COMPETITORS] SERP analysis with keywords:', topKeywords);
    
    // Query SERP for each keyword
    const tasks = topKeywords.map(keyword => ({
      keyword,
      location_code: locationCode,
      language_code: languageCode,
      depth: 20, // Top 20 results
    }));
    
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tasks),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();
    
    if (data.status_code !== 20000 || !data.tasks) {
      console.log('[COMPETITORS] SERP API error:', data.status_message || 'empty');
      return [];
    }

    const ownDomainBase = ownDomain.split('.')[0].toLowerCase();
    const domainScores = new Map<string, number>();
    
    // Aggregate domains from all SERP results
    for (const task of data.tasks) {
      if (!task.result?.[0]?.items) continue;
      
      for (const item of task.result[0].items) {
        if (item.type !== 'organic') continue;
        
        const domain = item.domain?.toLowerCase();
        if (!domain) continue;
        
        // Skip own domain
        if (domain.includes(ownDomainBase) || ownDomainBase.includes(domain.split('.')[0])) continue;
        // Skip blocked domains (with business context for smart filtering)
        if (isBlockedDomain(domain, businessContext)) continue;
        
        // Score by position (higher position = higher score)
        const position = item.rank_group || 20;
        const score = Math.max(0, 21 - position); // Position 1 = 20 points, Position 20 = 1 point
        domainScores.set(domain, (domainScores.get(domain) || 0) + score);
      }
    }
    
    // Sort by score and return top competitors
    const competitors = [...domainScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain]) => domain);
    
    console.log('[COMPETITORS] SERP found:', competitors);
    return competitors;

  } catch (e) {
    console.error('[COMPETITORS] SERP API error:', e);
    return [];
  }
}

// ============= AEO Q&A + SEO TITLES GENERATION =============
// Generate Q&A and SEO titles based on competitor consensus
async function generateQaAndSeoTitlesFromCompetitors(
  competitors: string[],
  keywords: Array<{ keyword: string; intent: string }>,
  language: string,
  apiKey: string
): Promise<Array<{
  question: string;
  shortAnswer: string;
  answer: string;
  seoTitle: string;
  intent: string;
}>> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const langInstruction =
      language === 'fr'
        ? 'Réponds en FRANÇAIS.'
        : 'Respond in ENGLISH.';

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-exp:free',
          messages: [
            {
              role: 'user',
              content: `You are an AEO & SEO content expert.

Goal:
Generate Q&A and SEO titles based on competitor consensus.

Competitors:
${competitors.map((c) => `- ${c}`).join('\n')}

Target keywords:
${keywords.map((k) => `- ${k.keyword} (${k.intent})`).join('\n')}

Rules:
- Identify questions answered by multiple competitors
- Rewrite them as CLEAR, neutral questions
- Provide:
  - Short direct answer (1–2 sentences)
  - Expanded answer (4–6 lines)
  - SEO title (≤ 60 characters)
- No marketing fluff
- High citability for AI answers (ChatGPT / Gemini)

${langInstruction}

Return ONLY JSON array:
[
  {
    "question": "...",
    "shortAnswer": "...",
    "answer": "...",
    "seoTitle": "...",
    "intent": "informational | commercial"
  }
]`,
            },
          ],
          temperature: 0.2,
          max_tokens: 1200,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.error('[AEO-QA] API error:', response.status);
      return [];
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);

    if (!match) {
      console.log('[AEO-QA] No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(match[0]);
    const results = Array.isArray(parsed) ? parsed.slice(0, 8) : [];
    console.log('[AEO-QA] Generated', results.length, 'Q&A items');
    return results;
  } catch (e) {
    console.error('[AEO-QA] Error:', e);
    return [];
  }
}

// SOURCE 5: Pure AI knowledge - ask LLM to name competitors from its training data
async function findCompetitorsViaAI(
  description: string,
  brandName: string,
  domain: string,
  language: string,
  apiKey: string,
  keywords: Array<{keyword: string, intent: string}> = []
): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const topKw = keywords.slice(0, 5).map(k => k.keyword).join(', ');
    const cleanBrand = brandName.split('–')[0].split('-')[0].split('|')[0].trim();
    const langInstr = language === 'fr' ? 'Réponds en français.' : 'Respond in English.';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [{
          role: 'user',
          content: `List 4-6 DIRECT competitor websites for this business. ${langInstr}

Business: ${cleanBrand} (${domain})
Description: ${description}
Keywords: ${topKw}

Rules:
- Return ONLY real, existing competitor DOMAINS (e.g., "semrush.com", "ahrefs.com")
- Must be DIRECT competitors offering similar products/services
- NO news sites, blogs, directories, or Wikipedia
- NO generic platforms (google.com, youtube.com, facebook.com)
- Return ONLY a JSON array of domain strings: ["competitor1.com", "competitor2.com"]`
        }],
        temperature: 0.3,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) return [];

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);
    
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        // Filter out own domain and clean
        const cleaned = parsed
          .filter((d: string) => typeof d === 'string')
          .map((d: string) => d.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').toLowerCase())
          .filter((d: string) => !d.includes(domain.split('.')[0]) && d.includes('.'));
        console.log('[COMPETITORS] AI suggested:', cleaned);
        return cleaned.slice(0, 6);
      }
    }
    return [];
  } catch (e) {
    console.error('[COMPETITORS] AI knowledge fallback error:', e);
    return [];
  }
}
