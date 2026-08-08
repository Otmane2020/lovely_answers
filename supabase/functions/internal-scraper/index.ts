const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Internal Scraper - Replaces Firecrawl when quota is exhausted.
 * Extracts: title, meta description, favicon, OG image, language, headings,
 * main content (markdown-like), links, CMS detection, brand name, schema.org data.
 */

interface ScrapeResult {
  success: boolean;
  data: {
    url: string;
    title: string;
    metaDescription: string;
    favicon: string;
    ogImage: string;
    language: string;
    country: string;
    brandName: string;
    cms: string;
    headings: { level: number; text: string }[];
    links: string[];
    internalLinks: string[];
    externalLinks: string[];
    markdown: string;
    html: string;
    wordCount: number;
    schemaTypes: string[];
    metadata: Record<string, string>;
  };
  error?: string;
}

function extractMetaContent(html: string, name: string): string {
  // Try name attribute
  const nameRegex = new RegExp(
    `<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*?)["']`,
    'i'
  );
  const match = html.match(nameRegex);
  if (match) return match[1].trim();

  // Try reversed order (content before name)
  const reversedRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*?)["'][^>]*(?:name|property)=["']${name}["']`,
    'i'
  );
  const match2 = html.match(reversedRegex);
  if (match2) return match2[1].trim();

  return '';
}

function extractFavicon(html: string, baseUrl: string): string {
  // Try link[rel=icon] variants
  const iconPatterns = [
    /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i,
    /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
  ];

  for (const pattern of iconPatterns) {
    const match = html.match(pattern);
    if (match) {
      const href = match[1];
      if (href.startsWith('http')) return href;
      if (href.startsWith('//')) return 'https:' + href;
      try {
        return new URL(href, baseUrl).href;
      } catch {
        return href;
      }
    }
  }

  // Default fallback
  try {
    return new URL('/favicon.ico', baseUrl).href;
  } catch {
    return '';
  }
}

function extractHeadings(html: string): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  const regex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      headings.push({ level: parseInt(match[1]), text });
    }
  }
  return headings;
}

function extractLinks(html: string, baseUrl: string): { internal: string[]; external: string[] } {
  const internal: string[] = [];
  const external: string[] = [];
  const seen = new Set<string>();

  let baseDomain = '';
  try {
    baseDomain = new URL(baseUrl).hostname.replace('www.', '');
  } catch {}

  const regex = /<a[^>]*href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let href = match[1].trim();
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;

    try {
      const fullUrl = new URL(href, baseUrl).href;
      if (seen.has(fullUrl)) continue;
      seen.add(fullUrl);

      const linkDomain = new URL(fullUrl).hostname.replace('www.', '');
      if (linkDomain === baseDomain) {
        internal.push(fullUrl);
      } else {
        external.push(fullUrl);
      }
    } catch {}
  }

  return { internal: internal.slice(0, 100), external: external.slice(0, 50) };
}

function htmlToMarkdown(html: string): string {
  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let content = bodyMatch ? bodyMatch[1] : html;

  // Remove unwanted elements
  content = content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Convert headings
  content = content.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  content = content.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  content = content.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  content = content.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');

  // Convert paragraphs and line breaks
  content = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  content = content.replace(/<br\s*\/?>/gi, '\n');
  content = content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

  // Convert links
  content = content.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Convert bold/italic
  content = content.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  content = content.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');

  // Remove remaining HTML tags
  content = content.replace(/<[^>]+>/g, ' ');

  // Clean up whitespace
  content = content
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();

  return content;
}

// Country-code TLDs worth trusting directly — deliberately excludes generic
// or ambiguous ones (.io, .co, .ai, .me...) that get used worldwide and
// would be misleading as a location signal.
const CC_TLD_COUNTRY: Record<string, string> = {
  fr: 'FR', de: 'DE', es: 'ES', it: 'IT', nl: 'NL', be: 'BE', pt: 'PT',
  ch: 'CH', at: 'AT', ie: 'IE', se: 'SE', no: 'NO', dk: 'DK', fi: 'FI',
  pl: 'PL', ca: 'CA', au: 'AU', nz: 'NZ', mx: 'MX', br: 'BR', ar: 'AR',
  ma: 'MA', dz: 'DZ', tn: 'TN', ae: 'AE', sa: 'SA', in: 'IN', jp: 'JP',
  sg: 'SG', za: 'ZA', us: 'US', uk: 'GB',
};

/** Best signal first: a JSON-LD/microdata postal address is an explicit,
 * business-stated location — far more reliable than guessing from the TLD
 * or hreflang, both of which just describe which market a page targets. */
function extractCountryFromAddress(html: string): string {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const nodes = Array.isArray(data) ? data : [data, ...(data['@graph'] || [])];
      for (const node of nodes) {
        const addr = node?.address;
        const raw = typeof addr?.addressCountry === 'string'
          ? addr.addressCountry
          : addr?.addressCountry?.name;
        if (typeof raw === 'string' && raw.length >= 2) return raw;
      }
    } catch {}
  }
  const microMatch = html.match(/itemprop=["']addressCountry["'][^>]*content=["']([^"']+)["']/i);
  if (microMatch) return microMatch[1];
  return '';
}

/** Falls back to hreflang region subtags (e.g. "fr-FR" -> FR), then the
 * domain's own country-code TLD. Neither is as reliable as a stated
 * address — both describe the market a page targets, not necessarily
 * where the business actually is — but still a reasonable starting guess. */
function detectCountry(html: string, hostname: string): string {
  const fromAddress = extractCountryFromAddress(html);
  if (fromAddress) return fromAddress.toUpperCase().slice(0, 2);

  const hreflangRegex = /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([a-z]{2})-([A-Z]{2})["']/gi;
  const regions: Record<string, number> = {};
  let m;
  while ((m = hreflangRegex.exec(html)) !== null) {
    regions[m[2]] = (regions[m[2]] || 0) + 1;
  }
  const topRegion = Object.entries(regions).sort((a, b) => b[1] - a[1])[0];
  if (topRegion) return topRegion[0];

  const tld = hostname.split('.').pop()?.toLowerCase();
  if (tld && CC_TLD_COUNTRY[tld]) return CC_TLD_COUNTRY[tld];

  return '';
}

function extractSchemaTypes(html: string): string[] {
  const types: string[] = [];
  // JSON-LD
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type']) {
        types.push(Array.isArray(data['@type']) ? data['@type'][0] : data['@type']);
      }
    } catch {}
  }
  // Microdata
  const microdataRegex = /itemtype=["']https?:\/\/schema\.org\/(\w+)["']/gi;
  while ((match = microdataRegex.exec(html)) !== null) {
    if (!types.includes(match[1])) types.push(match[1]);
  }
  return types;
}

function detectCMS(html: string): string {
  const c = html.toLowerCase();
  if (c.includes('woocommerce') || c.includes('wc-ajax')) return 'WooCommerce';
  if (c.includes('/wp-content/') || c.includes('/wp-includes/') || c.includes('wp-json')) return 'WordPress';
  if (c.includes('cdn.shopify.com') || c.includes('myshopify.com')) return 'Shopify';
  if (c.includes('wix.com') || c.includes('wixstatic.com')) return 'Wix';
  if (c.includes('webflow.com') || c.includes('w-webflow')) return 'Webflow';
  if (c.includes('framer.website') || c.includes('framer.app')) return 'Framer';
  if (c.includes('squarespace.com') || c.includes('sqsp.net')) return 'Squarespace';
  if (c.includes('duda.co') || c.includes('dudaone.com')) return 'Duda';
  if (c.includes('bigcommerce.com')) return 'BigCommerce';
  if (c.includes('prestashop') || c.includes('/modules/ps_')) return 'PrestaShop';
  // 'mage/' alone used to match — but so does every page's own
  // <link type="image/x-icon">, misidentifying nearly any site as Magento.
  if (c.includes('magento') || c.includes('/skin/frontend/') || c.includes('mage-init')) return 'Magento';
  if (c.includes('ghost.org') || c.includes('ghost-portal')) return 'Ghost';
  if (c.includes('drupal.org') || c.includes('/sites/default/files')) return 'Drupal';
  if (c.includes('joomla') || c.includes('/media/com_')) return 'Joomla';
  if (c.includes('hubspot.com') || c.includes('hs-scripts')) return 'HubSpot';
  if (c.includes('next-head-count') || c.includes('__next')) return 'Next.js';
  if (c.includes('nuxt') || c.includes('__nuxt')) return 'Nuxt';
  // Lovable-built sites are generic React/Vite output with no framework
  // fingerprint of their own, but Lovable's asset storage and editor SDK
  // domains are a real, verifiable signature (gpteng.co is the underlying
  // gpt-engineer infra Lovable runs on).
  if (c.includes('gpteng.co') || c.includes('gpt-engineer-file-uploads') || c.includes('lovableproject.com') || c.includes('lovable.app')) return 'Lovable';
  // Replit-hosted apps are identifiable by their own hosting domain — only
  // reliable while the site is still on a *.repl.co/*.replit.app/*.replit.dev
  // URL; a custom domain drops this signal (there is no other fingerprint).
  if (c.includes('.repl.co') || c.includes('.replit.app') || c.includes('.replit.dev')) return 'Replit';
  return '';
}

function extractBrandName(url: string, title: string): string {
  const genericTitles = [
    'accueil', 'home', 'homepage', 'inicio', 'bienvenue', 'welcome',
    'page d\'accueil', 'home page', 'startseite'
  ];

  if (title) {
    const titleLower = title.toLowerCase().trim();
    if (!genericTitles.includes(titleLower)) {
      const separators = [' - ', ' | ', ' – ', ' — ', ': '];
      for (const sep of separators) {
        if (title.includes(sep)) {
          const brand = title.split(sep)[0].trim();
          if (!genericTitles.includes(brand.toLowerCase()) && brand.length > 1 && brand.length < 40) {
            return brand;
          }
        }
      }
      if (title.length < 30) return title;
    }
  }

  try {
    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '');
    const name = domain.split('.')[0];
    return name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  } catch {
    return 'Unknown';
  }
}

/** Scores clean, human-written text (title/description/body — never raw
 * HTML/JS, which drowns out short taglines with boilerplate noise) against
 * per-language word lists and, as a lighter-weight tie-breaker, language-
 * distinctive accented characters (a single "está" or "être" is a real
 * signal even in a four-word tagline where whole-word matches are sparse). */
function scoreLanguageFromText(text: string): { lang: string; score: number } {
  const t = text.toLowerCase();
  const scores: Record<string, number> = { en: 0, fr: 0, de: 0, es: 0, it: 0, pt: 0 };

  const wordPatterns: Record<string, RegExp[]> = {
    fr: [/\bles\b/g, /\bdes\b/g, /\bpour\b/g, /\bavec\b/g, /\bdans\b/g, /\bc'est\b/g, /\bvotre\b/g, /\bnotre\b/g, /\bplus\b/g, /\bque\b/g, /\bqualité\b/g, /\bmaison\b/g],
    en: [/\bthe\b/g, /\band\b/g, /\byour\b/g, /\bwith\b/g, /\bfrom\b/g, /\bthat\b/g, /\bthis\b/g, /\bhave\b/g, /\bhome\b/g, /\bstyle\b/g],
    de: [/\bund\b/g, /\bder\b/g, /\bdie\b/g, /\bdas\b/g, /\bfür\b/g, /\bnicht\b/g, /\bsich\b/g, /\büber\b/g, /\bmehr\b/g],
    es: [/\bpara\b/g, /\bcon\b/g, /\bpor\b/g, /\bnuestro\b/g, /\btambién\b/g, /\bestá\b/g, /\bmás\b/g, /\bque\b/g, /\bun\b/g, /\buna\b/g, /\bestilo\b/g, /\bvida\b/g, /\bhogar\b/g, /\bcalidad\b/g],
    it: [/\bdella\b/g, /\bdei\b/g, /\bnon\b/g, /\bnostro\b/g, /\bquesto\b/g, /\bperché\b/g, /\bpiù\b/g],
    pt: [/\bnão\b/g, /\bvocê\b/g, /\bnosso\b/g, /\btambém\b/g, /\bmuito\b/g, /\besta\b/g, /\bmais\b/g],
  };
  for (const [lang, regs] of Object.entries(wordPatterns)) {
    for (const r of regs) {
      const m = t.match(r);
      if (m) scores[lang] += m.length;
    }
  }

  // Distinctive characters, weighted lightly (0.5) — good for breaking ties
  // on short text where whole-word hits are scarce, not strong enough alone
  // to override a real word-based signal for a different language.
  const charPatterns: Record<string, RegExp> = {
    es: /[ñ¿¡]|á|é|í|ó|ú/g,
    fr: /[çœ]|à|â|è|ê|ë|î|ï|ô|û|ù/g,
    de: /[ß]|ä|ö|ü/g,
    pt: /[ãõ]|â|ê|ô|ç/g,
    it: /à|è|ì|ò|ù/g,
  };
  for (const [lang, r] of Object.entries(charPatterns)) {
    const m = t.match(r);
    if (m) scores[lang] += m.length * 0.5;
  }

  let best = 'en';
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; best = lang; }
  }
  return { lang: best, score: bestScore };
}

/** A declared <html lang> is often just whatever a theme/template shipped
 * with, unrelated to the market a store actually targets (a Shopify site
 * can have shop_currency=USD, lang="en" in its boilerplate, and a homepage
 * tagline that's entirely Spanish). Content is the ground truth: only fall
 * back to the declared lang when the page's own text doesn't clearly say
 * otherwise. */
function detectLanguage(metaLang: string, title: string, description: string, bodyText: string): string {
  const declared = metaLang && metaLang.length >= 2 ? metaLang.substring(0, 2).toLowerCase() : '';
  // Title/description first and weighted by repetition (x3) — a tagline
  // saying "Más que un estilo de vida" is a stronger, cleaner signal than
  // the same words once each buried a thousand characters into body copy.
  const { lang: contentLang, score } = scoreLanguageFromText(
    `${title} ${title} ${title} ${description} ${description} ${bodyText.slice(0, 2000)}`
  );
  if (!declared) return contentLang && score > 2 ? contentLang : 'en';
  if (contentLang !== declared && score >= 3) return contentLang;
  return declared;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, timeout = 10000 } = await req.json();
    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = url.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // A malformed/incomplete domain (e.g. "https://clipmotion.") only fails
    // later as an opaque DNS error — reject it up front with a clear message.
    let hostname = '';
    try {
      const parsed = new URL(formattedUrl);
      hostname = parsed.hostname.replace(/\.+$/, '');
      parsed.hostname = hostname;
      formattedUrl = parsed.href;
    } catch {
      hostname = '';
    }
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(hostname)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid website URL "${url}". Please enter a complete domain, e.g. https://clipmotion.ai`,
          code: 'invalid_url',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[internal-scraper] Scraping:', formattedUrl);
    const startTime = Date.now();

    // Fetch the page with proper headers
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(formattedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const elapsed = Date.now() - startTime;
    console.log(`[internal-scraper] Fetched ${html.length} bytes in ${elapsed}ms`);

    // Extract everything
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
    const metaDescription = extractMetaContent(html, 'description');
    const ogDescription = extractMetaContent(html, 'og:description');
    const ogImage = extractMetaContent(html, 'og:image');
    const ogTitle = extractMetaContent(html, 'og:title');
    const favicon = extractFavicon(html, formattedUrl);
    const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
    const metaLang = langMatch?.[1] || '';
    const markdown = htmlToMarkdown(html);
    const language = detectLanguage(metaLang, title, metaDescription || ogDescription, markdown);
    const brandName = extractBrandName(formattedUrl, title);
    // Check the site's own hosting domain first — the most reliable signal
    // for Replit (there's no in-page fingerprint, only the *.repl.co/
    // *.replit.app/*.replit.dev URL itself, which a custom domain would hide).
    const hostLower = formattedUrl.toLowerCase();
    const cms = (hostLower.includes('.repl.co') || hostLower.includes('.replit.app') || hostLower.includes('.replit.dev'))
      ? 'Replit'
      : detectCMS(html);
    const headings = extractHeadings(html);
    const { internal: internalLinks, external: externalLinks } = extractLinks(html, formattedUrl);
    const wordCount = markdown.split(/\s+/).filter(w => w.length > 1).length;
    const schemaTypes = extractSchemaTypes(html);
    const country = detectCountry(html, new URL(formattedUrl).hostname);

    const result: ScrapeResult = {
      success: true,
      data: {
        url: formattedUrl,
        title: title || ogTitle,
        metaDescription: metaDescription || ogDescription,
        favicon,
        ogImage: ogImage ? (ogImage.startsWith('http') ? ogImage : new URL(ogImage, formattedUrl).href) : '',
        language,
        country,
        brandName,
        cms,
        headings: headings.slice(0, 30),
        links: [...internalLinks, ...externalLinks].slice(0, 100),
        internalLinks,
        externalLinks,
        markdown: markdown.substring(0, 50000),
        html: html.substring(0, 100000),
        wordCount,
        schemaTypes,
        metadata: {
          title,
          description: metaDescription || ogDescription,
          ogImage,
          ogTitle,
          language: metaLang,
        },
      },
    };

    console.log(`[internal-scraper] Done in ${Date.now() - startTime}ms | title="${title.substring(0, 50)}" | lang=${language} | country=${country || 'unknown'} | brand=${brandName} | cms=${cms} | words=${wordCount} | links=${internalLinks.length + externalLinks.length} | schema=${schemaTypes.join(',')}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[internal-scraper] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Scraping failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
