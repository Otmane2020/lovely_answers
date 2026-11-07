import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  const started = performance.now();
  const headers = { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (!['GET', 'HEAD'].includes(req.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' } });
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  let database = false;
  let auth = false;
  if (url && key) {
    const probe = async (path: string) => {
      try {
        const response = await fetch(`${url}${path}`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(5000),
        });
        await response.arrayBuffer();
        return response.ok;
      } catch { return false; }
    };
    [database, auth] = await Promise.all([
      probe('/rest/v1/projects?select=id&limit=0'),
      probe('/auth/v1/health'),
    ]);
  }
  const healthy = database && auth;
  return new Response(req.method === 'HEAD' ? null : JSON.stringify({
    ok: healthy,
    status: healthy ? 'OK' : 'UNAVAILABLE',
    latencyMs: Math.round(performance.now() - started),
  }), { status: healthy ? 200 : 503, headers });
});