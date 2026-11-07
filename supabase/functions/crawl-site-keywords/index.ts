import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CrawlRequest {
  projectId: string;
  maxPages?: number;
}

interface ExtractedKeyword {
  keyword: string;
  intent: 'informational' | 'transactional' | 'navigational' | 'commercial';
  difficulty: number;
  searchVolume: number;
  sourceUrl: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const lovableApiKey = Deno.env.get("OPENROUTER_API_KEY");

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { projectId, maxPages = 50 }: CrawlRequest = await req.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Project ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get project details
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found");
    }

    const websiteUrl = project.website_url;
    console.log(`[CRAWL] Starting crawl for project ${projectId}: ${websiteUrl}`);

    // Step 1: Map the website to get all URLs
    console.log('[CRAWL] Mapping website URLs...');
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: websiteUrl,
        limit: maxPages * 2, // Get more URLs to filter
        includeSubdomains: false,
      }),
    });

    if (!mapResponse.ok) {
      const error = await mapResponse.text();
      console.error('[CRAWL] Map failed:', error);
      throw new Error('Failed to map website');
    }

    const mapData = await mapResponse.json();
    const allUrls: string[] = mapData.links || [];
    
    console.log(`[CRAWL] Found ${allUrls.length} URLs`);

    // Filter URLs: prioritize blog posts, articles, product pages
    const priorityPatterns = ['/blog', '/article', '/post', '/news', '/guide', '/product', '/service', '/faq', '/about'];
    const excludePatterns = ['/cdn-cgi/', '/wp-admin/', '/cart', '/checkout', '/login', '/signup', '/account', '.pdf', '.jpg', '.png', '.gif', '/tag/', '/category/', '/author/'];
    
    const filteredUrls = allUrls
      .filter(url => !excludePatterns.some(p => url.toLowerCase().includes(p)))
      .sort((a, b) => {
        const aScore = priorityPatterns.filter(p => a.toLowerCase().includes(p)).length;
        const bScore = priorityPatterns.filter(p => b.toLowerCase().includes(p)).length;
        return bScore - aScore;
      })
      .slice(0, maxPages);

    console.log(`[CRAWL] Filtered to ${filteredUrls.length} URLs to scrape`);

    // Step 2: Scrape each URL and extract content
    const allContent: { url: string; content: string; title: string }[] = [];
    const batchSize = 5;

    for (let i = 0; i < filteredUrls.length; i += batchSize) {
      const batch = filteredUrls.slice(i, i + batchSize);
      console.log(`[CRAWL] Scraping batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(filteredUrls.length/batchSize)}`);

      const scrapePromises = batch.map(async (url) => {
        try {
          const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url,
              formats: ['markdown'],
              onlyMainContent: true,
              timeout: 15000,
            }),
          });

          if (!response.ok) return null;

          const data = await response.json();
          const markdown = data.data?.markdown || '';
          const title = data.data?.metadata?.title || '';

          if (markdown.length > 100) {
            return { url, content: markdown, title };
          }
          return null;
        } catch (e) {
          console.error(`[CRAWL] Failed to scrape ${url}:`, e);
          return null;
        }
      });

      const results = await Promise.all(scrapePromises);
      allContent.push(...results.filter(Boolean) as typeof allContent);

      // Small delay between batches to avoid rate limits
      if (i + batchSize < filteredUrls.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[CRAWL] Scraped ${allContent.length} pages successfully`);

    // Step 3: Extract keywords from all content using AI
    const allKeywords: ExtractedKeyword[] = [];

    if (lovableApiKey && allContent.length > 0) {
      // Process content in chunks for AI
      const contentChunks: { content: string; url: string }[] = [];
      
      for (const page of allContent) {
        // Sample content from each page
        const midStart = Math.max(0, Math.floor(page.content.length / 2) - 1000);
        const sampledContent = [
          page.content.substring(0, 2000),
          page.content.substring(midStart, midStart + 2000),
          page.content.substring(Math.max(0, page.content.length - 2000)),
        ].join('\n\n').substring(0, 5000);

        contentChunks.push({ content: sampledContent, url: page.url });
      }

      // Extract keywords in batches
      const chunkBatchSize = 10;
      for (let i = 0; i < contentChunks.length; i += chunkBatchSize) {
        const batch = contentChunks.slice(i, i + chunkBatchSize);
        const combinedContent = batch.map((c, idx) => `[PAGE ${idx + 1}: ${c.url}]\n${c.content}`).join('\n\n---\n\n');

        try {
          const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.0-flash-exp:free',
              messages: [{
                role: 'user',
                content: `Extract SEO keywords from this website content. For each keyword, identify:
- The keyword phrase (2-5 words, focus on long-tail keywords)
- Search intent: informational, transactional, navigational, or commercial
- Estimated difficulty (1-100)
- Estimated monthly search volume

Business: ${project.brand_name || project.name}
Industry: ${project.business_type || 'General'}
Language: ${project.language || 'en'}

Content from ${batch.length} pages:
${combinedContent.substring(0, 20000)}

Return ONLY a JSON array with this structure:
[
  {
    "keyword": "keyword phrase",
    "intent": "informational|transactional|navigational|commercial",
    "difficulty": 45,
    "searchVolume": 500,
    "sourceUrl": "https://..."
  }
]

Extract 20-30 high-quality, specific keywords from these pages. Focus on:
- Questions users might ask
- Product/service-related terms
- Industry-specific terminology
- Long-tail keywords with good AEO potential`
              }],
              temperature: 0.3,
              max_tokens: 4000,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const text = aiData.choices?.[0]?.message?.content || '';
            
            // Parse JSON from response
            const jsonMatch = text.match(/\[[\s\S]*?\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed)) {
                allKeywords.push(...parsed.map((k: any) => ({
                  keyword: k.keyword,
                  intent: k.intent || 'informational',
                  difficulty: k.difficulty || 50,
                  searchVolume: k.searchVolume || 100,
                  sourceUrl: k.sourceUrl || batch[0]?.url || websiteUrl,
                })));
              }
            }
          }
        } catch (e) {
          console.error('[CRAWL] AI extraction error:', e);
        }
      }
    }

    console.log(`[CRAWL] Extracted ${allKeywords.length} keywords`);

    // Step 4: Deduplicate and save keywords to database
    const uniqueKeywords = new Map<string, ExtractedKeyword>();
    for (const kw of allKeywords) {
      const key = kw.keyword.toLowerCase().trim();
      if (!uniqueKeywords.has(key) && key.length > 2) {
        uniqueKeywords.set(key, kw);
      }
    }

    const keywordsToInsert = Array.from(uniqueKeywords.values()).map(k => ({
      project_id: projectId,
      keyword: k.keyword,
      intent: k.intent,
      difficulty: k.difficulty,
      search_volume: k.searchVolume,
      source_url: k.sourceUrl,
      is_used: false,
    }));

    let newKeywordsAdded = 0;

    if (keywordsToInsert.length > 0) {
      // Get existing keywords to avoid duplicates
      const { data: existingKeywords } = await supabase
        .from('keywords')
        .select('keyword')
        .eq('project_id', projectId);

      const existingSet = new Set((existingKeywords || []).map(k => k.keyword.toLowerCase()));
      
      const newKeywords = keywordsToInsert.filter(k => !existingSet.has(k.keyword.toLowerCase()));
      newKeywordsAdded = newKeywords.length;

      if (newKeywords.length > 0) {
        const { error: insertError } = await supabase
          .from('keywords')
          .insert(newKeywords);

        if (insertError) {
          console.error('[CRAWL] Failed to insert keywords:', insertError);
        } else {
          console.log(`[CRAWL] Inserted ${newKeywords.length} new keywords`);
        }
      } else {
        console.log('[CRAWL] All keywords already exist');
      }
    }

    // Step 5: Save crawled pages to site_pages table
    const pagesToInsert = allContent.map(page => ({
      project_id: projectId,
      url: page.url,
      title: page.title,
      meta_description: null,
      last_crawled_at: new Date().toISOString(),
    }));

    if (pagesToInsert.length > 0) {
      // Upsert pages
      const { error: pagesError } = await supabase
        .from('site_pages')
        .upsert(pagesToInsert, { onConflict: 'project_id,url' });

      if (pagesError) {
        console.error('[CRAWL] Failed to save pages:', pagesError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pagesScraped: allContent.length,
        keywordsExtracted: Array.from(uniqueKeywords.values()).length,
        newKeywordsAdded,
        urls: filteredUrls,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CRAWL] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
