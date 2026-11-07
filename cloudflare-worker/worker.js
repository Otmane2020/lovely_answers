/**
 * Cloudflare Worker — cloudflare-worker-v2
 * autopilotgeo.com
 *
 * Architecture:
 *   Bot/Crawler  → Supabase prerender edge function (full SSR HTML)
 *   Human        → lovelyanswers.lovable.app (the live Lovable SPA)
 */

const ORIGIN = 'https://lovelyanswers.lovable.app';
const PRERENDER_URL = 'https://pnohfokjlhpzrkczruju.supabase.co/functions/v1/prerender';

const PRERENDER_PATHS = [
  '/',
  '/pricing',
  '/about',
  '/blog',
  '/privacy',
  '/terms',
  '/auth',
  '/signup',
  '/tools',
  '/tools/ai-visibility-checker',
  '/alternatives',
];

const BOT_AGENTS = [
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'facebot',
  'ia_archiver',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'applebot',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'dotbot',
  'rogerbot',
  'exabot',
  'petalbot',
  'claudebot',
  'gptbot',
  'chatgpt-user',
  'perplexitybot',
  'anthropic-ai',
  'cohere-ai',
  'omgili',
  'ffi/',
  'python-requests',
  'go-http-client',
  'java/',
  'curl/',
  'wget/',
  'scrapy',
  'node-fetch',
  'axios/',
  'okhttp',
  'httpx',
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_AGENTS.some((bot) => ua.includes(bot));
}

function shouldPrerender(pathname) {
  // Exact match
  if (PRERENDER_PATHS.includes(pathname)) return true;
  // Blog posts and public answer pages
  if (pathname.startsWith('/blog/')) return true;
  if (pathname.startsWith('/answers/')) return true;
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || '';
    const pathname = url.pathname;
    // Dynamic sitemap.xml → proxy to Supabase edge function (includes all blog/answers)
    if (pathname === '/sitemap.xml') {
      try {
        const smRes = await fetch('https://pnohfokjlhpzrkczruju.supabase.co/functions/v1/sitemap');
        if (smRes.ok) {
          return new Response(await smRes.text(), {
            headers: {
              'Content-Type': 'application/xml; charset=utf-8',
              'Cache-Control': 'public, max-age=3600',
              'X-Sitemap-Source': 'dynamic',
            },
          });
        }
      } catch (e) {
        console.error('Sitemap proxy error:', e);
      }
    }

    // Bot + prerenderable path → serve SSR from Supabase

    if (isBot(userAgent) && shouldPrerender(pathname)) {
      try {
        const prerenderReq = new Request(
          `${PRERENDER_URL}?path=${encodeURIComponent(pathname)}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        const prerenderRes = await fetch(prerenderReq);
        if (prerenderRes.ok) {
          const html = await prerenderRes.text();
          return new Response(html, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'X-Prerendered': 'true',
            },
          });
        }
      } catch (e) {
        console.error('Prerender error:', e);
      }
    }

    // All other traffic → proxy to Lovable origin
    const originUrl = new URL(request.url);
    originUrl.hostname = 'lovelyanswers.lovable.app';
    originUrl.protocol = 'https:';
    originUrl.port = '';

    const originRequest = new Request(originUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'follow',
    });

    const response = await fetch(originRequest);

    const newHeaders = new Headers(response.headers);
    newHeaders.delete('X-Frame-Options');

    // HTML documents: no cache (avoid stale bundle references after deploys)
    // Static assets (.js, .css, images, fonts): cache 24h (hashed filenames)
    const contentType = response.headers.get('Content-Type') || '';
    const isAsset = /\.(js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|ico|avif)(\?|$)/.test(pathname);

    if (isAsset || (!contentType.includes('text/html') && !pathname.endsWith('/') && pathname !== '/' && pathname.includes('.'))) {
      newHeaders.set('Cache-Control', 'public, max-age=86400, immutable');
    } else {
      newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
