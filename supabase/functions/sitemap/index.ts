import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Helper: paginated fetch to bypass 1000-row limit
    async function fetchAll(table: string, select: string, orderColumn: string, filters?: (q: any) => any) {
      const all: any[] = []
      let offset = 0
      const batchSize = 1000
      while (true) {
        let query = supabase.from(table).select(select).order(orderColumn, { ascending: false }).range(offset, offset + batchSize - 1)
        if (filters) query = filters(query)
        const { data, error } = await query
        if (error) { console.error(`Error fetching ${table}:`, error); throw error }
        if (data && data.length > 0) {
          all.push(...data)
          offset += batchSize
          if (data.length < batchSize) break
        } else break
      }
      return all
    }

    // 1. Fetch all public Q&A answers
    const answers = await fetchAll(
      'answers',
      'slug, published_at, updated_at, projects!inner(domain, website_url)',
      'published_at',
      (q: any) => q.eq('is_public', true).not('published_at', 'is', null)
    )

    // 2. Fetch all published blog articles from published_articles
    const publishedArticles = await fetchAll('published_articles', 'slug, published_at, updated_at', 'published_at')

    // 3. Fetch published articles from articles table (no published_at column)
    const directArticles = await fetchAll(
      'articles',
      'slug, created_at, updated_at, projects!inner(domain, website_url)',
      'created_at',
      (q: any) => q.eq('status', 'published').not('slug', 'is', null)
    )

    // Filter only autopilotgeo.com Q&A answers
    const siteAnswers = (answers || []).filter((answer: any) => {
      const projectUrl = (answer.projects?.website_url || '').toLowerCase()
      const projectDomain = (answer.projects?.domain || '').toLowerCase()
      return projectUrl.includes('autopilotgeo.com') || projectDomain === 'autopilotgeo.com'
    })

    // Filter only autopilotgeo.com direct articles
    const siteArticles = (directArticles || []).filter((article: any) => {
      const projectUrl = (article.projects?.website_url || '').toLowerCase()
      const projectDomain = (article.projects?.domain || '').toLowerCase()
      return projectUrl.includes('autopilotgeo.com') || projectDomain === 'autopilotgeo.com'
    })

    const today = new Date().toISOString().split('T')[0]

    // Collect all slugs to deduplicate
    const seenSlugs = new Set<string>()

    // Build sitemap XML
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>https://autopilotgeo.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Blog Index -->
  <url>
    <loc>https://autopilotgeo.com/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Pricing -->
  <url>
    <loc>https://autopilotgeo.com/pricing</loc>
    <lastmod>2026-01-25</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Authentication -->
  <url>
    <loc>https://autopilotgeo.com/auth</loc>
    <lastmod>2026-01-25</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <!-- About -->
  <url>
    <loc>https://autopilotgeo.com/about</loc>
    <lastmod>2026-01-25</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  
  <!-- Terms -->
  <url>
    <loc>https://autopilotgeo.com/terms</loc>
    <lastmod>2026-01-25</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.4</priority>
  </url>
  
  <!-- Privacy -->
  <url>
    <loc>https://autopilotgeo.com/privacy</loc>
    <lastmod>2026-01-25</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.4</priority>
  </url>
`

    // Add published blog articles from published_articles table
    for (const article of (publishedArticles || [])) {
      if (seenSlugs.has(article.slug)) continue
      seenSlugs.add(article.slug)

      const lastmod = article.updated_at 
        ? new Date(article.updated_at).toISOString().split('T')[0]
        : new Date(article.published_at).toISOString().split('T')[0]
      
      sitemap += `
  <url>
    <loc>https://autopilotgeo.com/blog/${article.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    }

    // Add published articles from articles table
    for (const article of siteArticles) {
      if (!article.slug || seenSlugs.has(article.slug)) continue
      seenSlugs.add(article.slug)

      const lastmod = article.updated_at 
        ? new Date(article.updated_at).toISOString().split('T')[0]
        : new Date(article.created_at).toISOString().split('T')[0]
      
      sitemap += `
  <url>
    <loc>https://autopilotgeo.com/blog/${article.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    }

    // Add Q&A answers (only if slug not already seen)
    for (const answer of siteAnswers) {
      if (seenSlugs.has(answer.slug)) continue
      seenSlugs.add(answer.slug)

      const lastmod = answer.updated_at 
        ? new Date(answer.updated_at).toISOString().split('T')[0]
        : new Date(answer.published_at).toISOString().split('T')[0]
      
      sitemap += `
  <url>
    <loc>https://autopilotgeo.com/blog/${answer.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    }

    sitemap += `
</urlset>`

    const totalPublishedArticles = (publishedArticles || []).length
    const totalDirectArticles = siteArticles.length
    const totalAnswers = siteAnswers.length
    console.log(`Generated sitemap with ${totalPublishedArticles} published_articles + ${totalDirectArticles} direct articles + ${totalAnswers} Q&A answers (${seenSlugs.size} unique URLs)`)

    return new Response(sitemap, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    })

  } catch (error) {
    console.error('Sitemap generation error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to generate sitemap' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})