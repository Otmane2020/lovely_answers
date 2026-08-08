import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SitemapUrl {
  url: string;
  title?: string;
  meta_description?: string;
}

async function parseSitemapXml(sitemapUrl: string): Promise<string[]> {
  console.log(`[parse-sitemap] Fetching sitemap from: ${sitemapUrl}`);
  
  const response = await fetch(sitemapUrl, {
    headers: {
      "User-Agent": "AutopilotGEO-Bot/1.0",
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status}`);
  }
  
  const xmlText = await response.text();
  const urls: string[] = [];
  
  // Check if this is a sitemap index (contains other sitemaps)
  const sitemapIndexMatches = xmlText.matchAll(/<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/gi);
  const nestedSitemaps = [...sitemapIndexMatches].map(m => m[1].trim());
  
  if (nestedSitemaps.length > 0) {
    console.log(`[parse-sitemap] Found sitemap index with ${nestedSitemaps.length} nested sitemaps`);
    // Recursively parse nested sitemaps (limit to first 5 to avoid timeout)
    for (const nestedUrl of nestedSitemaps.slice(0, 5)) {
      try {
        const nestedUrls = await parseSitemapXml(nestedUrl);
        urls.push(...nestedUrls);
      } catch (e) {
        console.error(`[parse-sitemap] Error parsing nested sitemap ${nestedUrl}:`, e);
      }
    }
  } else {
    // Parse regular sitemap
    const urlMatches = xmlText.matchAll(/<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/url>/gi);
    for (const match of urlMatches) {
      const url = match[1].trim();
      if (url && !url.includes('.xml')) {
        urls.push(url);
      }
    }
  }
  
  console.log(`[parse-sitemap] Extracted ${urls.length} URLs`);
  return urls;
}

async function fetchPageMetadata(url: string, firecrawlApiKey?: string): Promise<{ title?: string; meta_description?: string }> {
  if (!firecrawlApiKey) {
    // Simple fetch fallback
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "AutopilotGEO-Bot/1.0" },
      });
      const html = await response.text();
      
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i) ||
                        html.match(/<meta[^>]*content=["'](.*?)["'][^>]*name=["']description["']/i);
      
      return {
        title: titleMatch?.[1]?.trim().slice(0, 200),
        meta_description: descMatch?.[1]?.trim().slice(0, 500),
      };
    } catch {
      return {};
    }
  }
  
  // Use Firecrawl for better extraction
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.data?.metadata?.title?.slice(0, 200),
        meta_description: data.data?.metadata?.description?.slice(0, 500),
      };
    }
  } catch (e) {
    console.error(`[parse-sitemap] Firecrawl error for ${url}:`, e);
  }
  
  return {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, sitemapUrl, fetchMetadata = false } = await req.json();

    if (!projectId || !sitemapUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing projectId or sitemapUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse the sitemap
    const urls = await parseSitemapXml(sitemapUrl);
    
    // Limit to 500 URLs to avoid issues
    const limitedUrls = urls.slice(0, 500);
    console.log(`[parse-sitemap] Processing ${limitedUrls.length} URLs for project ${projectId}`);

    // Prepare pages data
    const pages: SitemapUrl[] = [];
    
    if (fetchMetadata) {
      // Fetch metadata for first 50 pages (to avoid timeout)
      const urlsToFetch = limitedUrls.slice(0, 50);
      for (const url of urlsToFetch) {
        const metadata = await fetchPageMetadata(url, firecrawlApiKey);
        pages.push({ url, ...metadata });
      }
      // Add remaining URLs without metadata
      for (const url of limitedUrls.slice(50)) {
        pages.push({ url });
      }
    } else {
      for (const url of limitedUrls) {
        pages.push({ url });
      }
    }

    // Delete existing pages for this project
    await supabase
      .from("site_pages")
      .delete()
      .eq("project_id", projectId);

    // Insert new pages in batches
    const batchSize = 100;
    let insertedCount = 0;
    
    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize).map(page => ({
        project_id: projectId,
        url: page.url,
        title: page.title || null,
        meta_description: page.meta_description || null,
        last_crawled_at: new Date().toISOString(),
      }));
      
      const { error } = await supabase
        .from("site_pages")
        .insert(batch);
      
      if (error) {
        console.error(`[parse-sitemap] Insert error:`, error);
      } else {
        insertedCount += batch.length;
      }
    }

    console.log(`[parse-sitemap] Successfully inserted ${insertedCount} pages`);

    return new Response(
      JSON.stringify({
        success: true,
        totalFound: urls.length,
        processed: limitedUrls.length,
        inserted: insertedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[parse-sitemap] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
