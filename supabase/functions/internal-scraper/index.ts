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
  if (c.includes('magento') || c.includes('mage/')) return 'Magento';
  if (c.includes('ghost.org') || c.includes('ghost-portal')) return 'Ghost';
  if (c.includes('drupal.org') || c.includes('/sites/default/files')) return 'Drupal';
  if (c.includes('joomla') || c.includes('/media/com_')) return 'Joomla';
  if (c.includes('hubspot.com') || c.includes('hs-scripts')) return 'HubSpot';
  if (c.includes('next-head-count') || c.includes('__next')) return 'Next.js';
  if (c.includes('nuxt') || c.includes('__nuxt')) return 'Nuxt';
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

function detectLanguage(html: string, metaLang: string): string {
  if (metaLang && metaLang.length >= 2) return metaLang.substring(0, 2).toLowerCase();

  const text = html.substring(0, 8000).toLowerCase();
  const scores: Record<string, number> = { en: 0, fr: 0, de: 0, es: 0, it: 0, pt: 0 };

  const patterns: Record<string, RegExp[]> = {
    fr: [/\bles\b/g, /\bdes\b/g, /\bpour\b/g, /\bavec\b/g, /\bdans\b/g, /\bc'est\b/g, /\bvotre\b/g, /\bnotre\b/g],
    en: [/\bthe\b/g, /\band\b/g, /\byour\b/g, /\bwith\b/g, /\bfrom\b/g, /\bthat\b/g, /\bthis\b/g, /\bhave\b/g],
    de: [/\bund\b/g, /\bder\b/g, /\bdie\b/g, /\bdas\b/g, /\bfür\b/g, /\bnicht\b/g, /\bsich\b/g, /\büber\b/g],
    es: [/\bpara\b/g, /\bcon\b/g, /\bpor\b/g, /\bnuestro\b/g, /\btambién\b/g, /\bestá\b/g],
    it: [/\bdella\b/g, /\bdei\b/g, /\bnon\b/g, /\bnostro\b/g, /\bquesto\b/g, /\bperché\b/g],
    pt: [/\bnão\b/g, /\bvocê\b/g, /\bnosso\b/g, /\btambém\b/g, /\bmuito\b/g, /\besta\b/g],
  };

  for (const [lang, regs] of Object.entries(patterns)) {
    for (const r of regs) {
      const m = text.match(r);
      if (m) scores[lang] += m.length;
    }
  }

  let best = 'en';
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; best = lang; }
  }
  return bestScore > 5 ? best : 'en';
}

// SECURITY: block SSRF to private/loopback/cloud-metadata IP ranges.
function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv6 loopback / link-local / unique-local
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  // IPv4
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + AWS/GCP/Azure metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: require an authenticated caller. Edge function is reached via
  // supabase.functions.invoke which forwards the user JWT in Authorization.
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsErr } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (_e) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // SECURITY: SSRF guard — block private / loopback / metadata hosts before fetch.
    try {
      const parsed = new URL(formattedUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return new Response(JSON.stringify({ success: false, error: "Unsupported protocol" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (isPrivateOrReservedHost(parsed.hostname)) {
        return new Response(JSON.stringify({ success: false, error: "Target host is not allowed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    const language = detectLanguage(html, metaLang);
    const brandName = extractBrandName(formattedUrl, title);
    const cms = detectCMS(html);
    const headings = extractHeadings(html);
    const { internal: internalLinks, external: externalLinks } = extractLinks(html, formattedUrl);
    const markdown = htmlToMarkdown(html);
    const wordCount = markdown.split(/\s+/).filter(w => w.length > 1).length;
    const schemaTypes = extractSchemaTypes(html);

    const result: ScrapeResult = {
      success: true,
      data: {
        url: formattedUrl,
        title: title || ogTitle,
        metaDescription: metaDescription || ogDescription,
        favicon,
        ogImage: ogImage ? (ogImage.startsWith('http') ? ogImage : new URL(ogImage, formattedUrl).href) : '',
        language,
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

    console.log(`[internal-scraper] Done in ${Date.now() - startTime}ms | title="${title.substring(0, 50)}" | lang=${language} | brand=${brandName} | cms=${cms} | words=${wordCount} | links=${internalLinks.length + externalLinks.length} | schema=${schemaTypes.join(',')}`);

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
