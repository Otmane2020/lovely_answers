import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PublishRequest {
  integrationId?: string;
  projectId?: string;
  articleId?: string;
  answerId?: string;
  content?: {
    title: string;
    body: string;
    excerpt?: string;
    slug?: string;
    type: "answer" | "article" | "local-answer";
    sourceId: string;
  };
  // Legacy support
  platform?: string;
  credentials?: Record<string, string>;
  // Internal: marks a recursive duplicate-language publish to prevent loops
  _duplicateLang?: "fr" | "en";
}

// ───────── ranki.ai dual-language duplicate publishing ─────────
// For projects whose website_url contains "ranki.ai", every publish is
// duplicated in the opposite language (FR ↔ EN) via OpenRouter.
const RANKI_DOMAIN_MATCH = "ranki.ai";

async function translateContent(
  title: string,
  body: string,
  targetLang: "fr" | "en"
): Promise<{ title: string; body: string } | null> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.error("[cms-publish] OPENROUTER_API_KEY missing — cannot translate");
    return null;
  }
  const langName = targetLang === "fr" ? "French" : "English";
  const sys = `You are a professional SEO translator. Translate the given blog post to natural, fluent ${langName}. PRESERVE all HTML tags exactly. Do NOT add commentary. Return strict JSON: {"title":"...","body":"..."}.`;
  const user = `Translate to ${langName}.\n\nTITLE:\n${title}\n\nBODY (HTML):\n${body}`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in translation response");
    const parsed = JSON.parse(match[0]);
    if (!parsed.title || !parsed.body) throw new Error("Incomplete translation payload");
    return { title: String(parsed.title), body: String(parsed.body) };
  } catch (e) {
    console.error("[cms-publish] Translation failed:", e);
    return null;
  }
}

function normalizeEditorialBody(input: string): string {
  let html = (input || "").trim();
  if (!html) return "";
  html = html.replace(/<!doctype[^>]*>/gi, "");
  html = html.replace(/<\/?(?:html|head|body)[^>]*>/gi, "");
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "");
  html = html.replace(/<\/?(?:article|section)[^>]*>/gi, "");
  html = html.replace(/<\/?header[^>]*>[\s\S]*?<\/header>/gi, "");
  html = html.replace(/<\/?footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  html = html.replace(/<meta[^>]*>/gi, "");
  html = html.replace(/\sstyle\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\sstyle\s*=\s*'[^']*'/gi, "");

  // Repair stray/unclosed heading tags by normalizing through markdown markers
  html = html.replace(/<\s*h([2-6])[^>]*>([\s\S]*?)<\s*\/\s*h\1\s*>/gi,
    (_m, lvl, inner) => `\n\n${"#".repeat(Number(lvl))} ${String(inner).trim()}\n\n`);
  html = html.replace(/<\s*h([2-6])[^>]*>/gi, (_m, lvl) => `\n\n${"#".repeat(Number(lvl))} `);
  html = html.replace(/<\s*\/\s*h[2-6]\s*>/gi, "\n\n");

  // Inline markdown headings (AI often returns a single-line blob with `## ...  next sentence`)
  html = html.replace(/\s+(#{2,6})\s+([^\n]+?)(?=\s{2,}|\s+#{2,6}\s+|\n|$)/g,
    (_m, hashes, txt) => `\n\n${hashes} ${txt.trim()}\n\n`);
  // Line-start headings
  html = html.replace(/(^|\n)\s*#{2}\s+(.+)$/gm, "$1<h2>$2</h2>");
  html = html.replace(/(^|\n)\s*#{3}\s+(.+)$/gm, "$1<h3>$2</h3>");
  html = html.replace(/(^|\n)\s*#{4}\s+(.+)$/gm, "$1<h4>$2</h4>");

  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

  // Bullet lists from inline "* " patterns → ul
  html = html.replace(/\s+\*\s{2,}/g, "\n* ");
  html = html.replace(/(?<=[.:])\s+\*\s+(?=\*\*|[A-Z])/g, "\n* ");
  html = html.replace(/(?:(?:^|\n)\*\s+[^\n]+){2,}/g, (block) => {
    const items = block.trim().split(/\n\*\s+/).filter(Boolean).map((s) => s.replace(/^\*\s+/, ""));
    return "\n\n<ul>" + items.map((i) => `<li>${i.trim()}</li>`).join("") + "</ul>\n\n";
  });

  // Paragraph break on double-space after sentence end
  html = html.replace(/([.!?])\s{2,}(?=[A-Z"*<])/g, "$1\n\n");

  html = html.replace(/(^|\n)\s*(Opening Summary|Comparison Criteria|Tool Solutions for Enterprise Content Strategy|Brand|ChatGPT \(OpenAI\)|Gemini \(Google\)|Perplexity AI|Comparison Table|How to Choose the Right AI for Your Enterprise|FAQ)\s*$/gmi, "$1<h2>$2</h2>");
  html = html.split(/\n{2,}/).map((chunk) => {
    const text = chunk.trim();
    if (!text) return "";
    if (/^<(h[1-6]|p|ul|ol|li|blockquote|table|thead|tbody|tr|div|details|summary)/i.test(text)) return text;
    return `<p>${text.replace(/\n+/g, "<br>")}</p>`;
  }).filter(Boolean).join("\n\n");
  return html.replace(/\n{3,}/g, "\n\n").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ============ GET REQUEST: Serve published content as HTML ============
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/").filter(Boolean);
      
      // Expected path: /cms-publish/answer/{id} or /cms-publish/article/{id}
      // pathParts after functions/v1: ["cms-publish", "answer", "{id}"]
      const cmsIndex = pathParts.findIndex(p => p === "cms-publish");
      const contentType = pathParts[cmsIndex + 1]; // "answer" or "article"
      const contentId = pathParts[cmsIndex + 2]; // UUID
      
      console.log(`[cms-publish] GET request: type=${contentType}, id=${contentId}`);
      
      if (!contentId || !contentType) {
        return new Response(
          generateErrorHTML("Content Not Found", "Invalid URL format. Expected: /cms-publish/answer/{id} or /cms-publish/article/{id}"),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } }
        );
      }

      if (contentType === "answer") {
        // Fetch the answer from database
        const { data: answer, error } = await supabase
          .from("answers")
          .select("*, projects(brand_name, website_url, language)")
          .eq("id", contentId)
          .single();

        if (error || !answer) {
          console.error("[cms-publish] Answer not found:", error);
          return new Response(
            generateErrorHTML("Answer Not Found", "This answer does not exist or has been removed."),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } }
          );
        }

        // Generate and return HTML page
        const html = generatePublicAnswerHTML(answer);
        return new Response(html, {
          headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
        });

      } else if (contentType === "article") {
        // Fetch the article from database
        const { data: article, error } = await supabase
          .from("articles")
          .select("*, projects(brand_name, website_url, language)")
          .eq("id", contentId)
          .single();

        if (error || !article) {
          console.error("[cms-publish] Article not found:", error);
          return new Response(
            generateErrorHTML("Article Not Found", "This article does not exist or has been removed."),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } }
          );
        }

        // Generate and return HTML page
        const html = generatePublicArticleHTML(article);
        return new Response(html, {
          headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
        });
      } else {
        return new Response(
          generateErrorHTML("Invalid Content Type", "Supported types: answer, article"),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    } catch (error) {
      console.error("[cms-publish] GET error:", error);
      return new Response(
        generateErrorHTML("Server Error", error instanceof Error ? error.message : "Unknown error"),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } }
      );
    }
  }

  // ============ POST REQUEST: Publish content to CMS ============
  try {
    // Get auth token from header
    const authHeader = req.headers.get("Authorization");
    
    // Check if this is an internal call (from other edge functions using service role key)
    const isInternalCall = authHeader?.includes(supabaseKey);
    
    // Track userId for GSC indexation (using user's OAuth tokens)
    let authenticatedUserId: string | null = null;
    
    // Verify user is authenticated (skip for internal calls)
    if (authHeader && !isInternalCall) {
      const token = authHeader.replace("Bearer ", "");
      const authClient = createClient(supabaseUrl, anonKey);
      const { data: { user }, error: authError } = await authClient.auth.getUser(token);
      
      if (authError || !user) {
        console.error("[cms-publish] Auth error:", authError?.message);
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`[cms-publish] Authenticated user: ${user.email}`);
      authenticatedUserId = user.id;
    } else if (isInternalCall) {
      console.log(`[cms-publish] Internal call from edge function`);
    }

    // Parse request body with error handling for empty/invalid JSON
    let requestData: PublishRequest;
    try {
      const bodyText = await req.text();
      if (!bodyText || bodyText.trim() === "") {
        return new Response(
          JSON.stringify({ error: "Request body is required for POST requests" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      requestData = JSON.parse(bodyText);
    } catch (parseError) {
      console.error("[cms-publish] JSON parse error:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    let platform: string;
    let config: Record<string, string>;
    let content: { title: string; body: string; excerpt?: string; slug?: string };
    let projectWebsiteUrl: string | null = null;
    let projectLanguage: string | null = null;

    // New flow: use integrationId to get stored config
    if (requestData.integrationId) {
      console.log(`[cms-publish] Using integration ${requestData.integrationId}`);

      // SECURITY: Fetch integration WITH project user_id + website_url + language
      const { data: integration, error: intError } = await supabase
        .from("integrations")
        .select("*, projects!inner(user_id, website_url, language)")
        .eq("id", requestData.integrationId)
        .single();

      if (intError || !integration) {
        console.error(`[cms-publish] Integration not found: ${requestData.integrationId}`);
        throw new Error("Integration not found");
      }

      // CRITICAL SECURITY CHECK: Verify user owns this integration
      // Skip for internal calls (cron jobs, etc.)
      if (!isInternalCall && authenticatedUserId) {
        const integrationOwnerId = (integration.projects as { user_id: string }).user_id;
        if (integrationOwnerId !== authenticatedUserId) {
          console.error(`[cms-publish] SECURITY VIOLATION: User ${authenticatedUserId} attempted to access integration owned by ${integrationOwnerId}`);
          return new Response(
            JSON.stringify({ error: "Access denied - integration belongs to another user" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.log(`[cms-publish] Ownership verified for user ${authenticatedUserId}`);
      }

      platform = integration.platform;
      config = integration.config as Record<string, string>;
      const proj = integration.projects as { user_id: string; website_url: string | null; language: string | null };
      projectWebsiteUrl = proj?.website_url || null;
      projectLanguage = proj?.language || null;

      if (requestData.content) {
        content = {
          title: requestData.content.title,
          body: requestData.content.body,
          excerpt: requestData.content.excerpt,
          slug: requestData.content.slug,
        };
      } else {
        throw new Error("Content is required");
      }
    }
    // Legacy flow: use provided credentials
    else if (requestData.platform && requestData.credentials) {
      platform = requestData.platform;
      config = requestData.credentials;

      if (requestData.articleId) {
        const { data: article, error: articleError } = await supabase
          .from("articles")
          .select("*")
          .eq("id", requestData.articleId)
          .single();

        if (articleError || !article) {
          throw new Error("Article not found");
        }
        content = { title: article.title, body: article.content || "" };
      } else {
        throw new Error("Article ID is required");
      }
    } else {
      throw new Error("Either integrationId or platform+credentials is required");
    }

    console.log(`[cms-publish] Publishing to ${platform}`);

    let publishResult: {
      success: boolean;
      publishedUrl?: string;
      publishedId?: string;
      message?: string;
    };

    switch (platform) {
      case "wordpress":
        publishResult = await publishToWordPress(content, config);
        break;
      case "webflow":
        publishResult = await publishToWebflow(content, config);
        break;
      case "shopify":
        publishResult = await publishToShopify(content, config);
        break;
      case "wix":
        publishResult = await publishToWix(content, config);
        break;
      case "webhook":
        publishResult = await publishToWebhook(content, config);
        break;
      case "api":
        publishResult = await publishToCustomApi(content, config);
        break;
      case "duda":
        publishResult = await publishToDuda(content, config);
        break;
      case "bigcommerce":
        publishResult = await publishToBigCommerce(content, config);
        break;
      case "framer":
      case "snapps":
        publishResult = await publishToWebhook(content, config);
        break;
      case "lovable":
        publishResult = await publishToLovable(content, config, requestData.content?.sourceId);
        break;
      case "google_business":
        // Google Business is handled separately via gmb-publish-post, skip here
        publishResult = { success: true, publishedUrl: null };
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    if (publishResult.success && requestData.articleId) {
      await supabase
        .from("articles")
        .update({ status: "published" })
        .eq("id", requestData.articleId);

      // Request Google Search Console indexation if URL is available
      if (publishResult.publishedUrl) {
        // Get userId for GSC indexation - try authenticated user first, then fallback to project owner
        let userIdForIndexation = authenticatedUserId;
        
        if (!userIdForIndexation && requestData.integrationId) {
          // Get project owner from integration -> project -> user_id
          const { data: integration } = await supabase
            .from("integrations")
            .select("project_id")
            .eq("id", requestData.integrationId)
            .single();
          
          if (integration?.project_id) {
            const { data: project } = await supabase
              .from("projects")
              .select("user_id")
              .eq("id", integration.project_id)
              .single();
            
            userIdForIndexation = project?.user_id || null;
          }
        }
        
        if (userIdForIndexation) {
          try {
            console.log(`[cms-publish] Requesting GSC indexation for: ${publishResult.publishedUrl} (userId: ${userIdForIndexation})`);
            
            const indexingResponse = await fetch(`${supabaseUrl}/functions/v1/gsc-request-indexing`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                articleId: requestData.articleId,
                publishedUrl: publishResult.publishedUrl,
                userId: userIdForIndexation,
              }),
            });

            const indexingResult = await indexingResponse.json();
            console.log(`[cms-publish] GSC indexation result:`, indexingResult);
          } catch (indexError) {
            console.error("[cms-publish] GSC indexation error (non-blocking):", indexError);
            // Don't fail the publish if indexation fails
          }
        } else {
          console.log("[cms-publish] No userId available for GSC indexation, skipping");
        }
      }
    }

    // ───────── ranki.ai: duplicate publish in the opposite language ─────────
    let duplicateResult: { success: boolean; publishedUrl?: string; lang?: string; message?: string } | null = null;
    if (
      publishResult.success &&
      !requestData._duplicateLang &&
      projectWebsiteUrl &&
      projectWebsiteUrl.toLowerCase().includes(RANKI_DOMAIN_MATCH)
    ) {
      const sourceLang = (projectLanguage || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
      const targetLang: "fr" | "en" = sourceLang === "fr" ? "en" : "fr";
      console.log(`[cms-publish] ranki.ai detected — duplicating publish ${sourceLang} → ${targetLang}`);
      try {
        const translated = await translateContent(content.title, content.body, targetLang);
        if (translated) {
          const dupContent: { title: string; body: string; excerpt?: string; slug?: string } = {
            title: translated.title,
            body: translated.body,
            excerpt: content.excerpt,
            slug: content.slug ? `${content.slug}-${targetLang}` : undefined,
          };
          let dupPublish: { success: boolean; publishedUrl?: string; publishedId?: string; message?: string };
          switch (platform) {
            case "wordpress": dupPublish = await publishToWordPress(dupContent, config); break;
            case "webflow":   dupPublish = await publishToWebflow(dupContent, config); break;
            case "shopify":   dupPublish = await publishToShopify(dupContent, config); break;
            case "wix":       dupPublish = await publishToWix(dupContent, config); break;
            case "webhook":
            case "framer":
            case "snapps":    dupPublish = await publishToWebhook(dupContent, config); break;
            case "api":       dupPublish = await publishToCustomApi(dupContent, config); break;
            case "duda":      dupPublish = await publishToDuda(dupContent, config); break;
            case "bigcommerce": dupPublish = await publishToBigCommerce(dupContent, config); break;
            case "lovable":   dupPublish = await publishToLovable(dupContent, config, requestData.content?.sourceId); break;
            default:          dupPublish = { success: false, message: `Duplicate skipped (unsupported platform ${platform})` };
          }
          duplicateResult = { ...dupPublish, lang: targetLang };
          console.log(`[cms-publish] Duplicate (${targetLang}) result:`, dupPublish);
        } else {
          duplicateResult = { success: false, lang: targetLang, message: "Translation failed" };
        }
      } catch (dupErr) {
        console.error("[cms-publish] Duplicate publish error (non-blocking):", dupErr);
        duplicateResult = { success: false, lang: targetLang, message: dupErr instanceof Error ? dupErr.message : "Unknown error" };
      }
    }

    console.log(`[cms-publish] Result: ${JSON.stringify(publishResult)}`);

    return new Response(
      JSON.stringify({
        success: publishResult.success,
        platform,
        publishedUrl: publishResult.publishedUrl,
        publishedId: publishResult.publishedId,
        message: publishResult.message,
        publishedAt: new Date().toISOString(),
        duplicate: duplicateResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[cms-publish] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function publishToWordPress(
  content: { title: string; body: string },
  config: Record<string, string>
): Promise<{ success: boolean; publishedUrl?: string; publishedId?: string; message?: string }> {
  if (!config.endpoint) {
    return { success: false, message: "WordPress site URL is required. Check your configuration." };
  }

  try {
    // Clean up endpoint URL
    let siteUrl = config.endpoint.trim().replace(/\/+$/, '');
    if (!siteUrl.startsWith("http")) {
      siteUrl = `https://${siteUrl}`;
    }
    
    console.log(`[WordPress] Publishing to ${siteUrl}`);
    
    // Build authorization header
    let authHeader: string;
    
    // Get username and password
    let username = config.username?.trim() || "";
    let password = config.token?.trim() || "";
    
    // Application passwords can have spaces - remove them for the auth header
    // WordPress returns them with spaces but they work without
    password = password.replace(/\s+/g, "");
    
    if (!username || !password) {
      return { success: false, message: "WordPress username and Application Password are required." };
    }
    
    // Use Basic Auth with username:application_password
    const basicAuth = btoa(`${username}:${password}`);
    authHeader = `Basic ${basicAuth}`;
    
    console.log(`[WordPress] Using Basic Auth for user: ${username}`);
    
    const postBody = JSON.stringify({
      title: content.title,
      content: content.body,
      excerpt: (content as any).excerpt || undefined,
      slug: (content as any).slug || undefined,
      status: "publish",
    });
    const postHeaders = {
      Authorization: authHeader,
      "Content-Type": "application/json",
    };

    // Try pretty permalinks first, then fall back to plain (?rest_route=)
    let response = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: postHeaders,
      body: postBody,
    });
    if (response.status === 404) {
      console.log(`[WordPress] /wp-json 404, falling back to ?rest_route=`);
      response = await fetch(`${siteUrl}/?rest_route=/wp/v2/posts`, {
        method: "POST",
        headers: postHeaders,
        body: postBody,
      });
    }


    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();
      console.error(`[WordPress] Error ${status}: ${errorText}`);
      
      if (status === 401 || status === 403) {
        return { success: false, message: "Invalid credentials. Check your username and Application Password in Users → Profile → Application Passwords." };
      } else if (status === 404) {
        return { success: false, message: "WordPress REST API not found. Verify the site URL is correct and permalinks are enabled." };
      } else if (status === 429) {
        return { success: false, message: "Rate limit exceeded. Try again later." };
      }
      return { success: false, message: `WordPress API error (${status}): ${errorText.substring(0, 200)}` };
    }

    const data = await response.json();
    console.log(`[WordPress] Published successfully: ${data.link}`);
    return {
      success: true,
      publishedUrl: data.link,
      publishedId: String(data.id),
    };
  } catch (error) {
    console.error("[WordPress] Exception:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "WordPress publish failed - network error",
    };
  }
}

async function publishToWebflow(
  content: { title: string; body: string },
  config: Record<string, string>
): Promise<{ success: boolean; publishedUrl?: string; publishedId?: string; message?: string }> {
  if (!config.token || !config.endpoint) {
    throw new Error("Webflow token and collection ID required");
  }

  try {
    const response = await fetch(
      `https://api.webflow.com/v2/collections/${config.endpoint}/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isArchived: false,
          isDraft: false,
          fieldData: {
            name: content.title,
            slug: content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            "post-body": content.body,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webflow API error: ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      publishedId: data.id,
      publishedUrl: data.slug ? `https://site.webflow.io/blog/${data.slug}` : undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Webflow publish failed",
    };
  }
}

async function publishToShopify(
  content: { title: string; body: string },
  config: Record<string, string>
): Promise<{ success: boolean; publishedUrl?: string; publishedId?: string; message?: string }> {
  if (!config.endpoint || !config.token) {
    return { success: false, message: "Shopify store URL and Admin API token required. Check your configuration." };
  }

  try {
    // Clean up endpoint - remove trailing slashes
    const storeUrl = config.endpoint.replace(/\/+$/, '');
    console.log(`[Shopify] Publishing to ${storeUrl}`);
    
    // Get the first blog ID
    const blogsResponse = await fetch(`${storeUrl}/admin/api/2024-01/blogs.json`, {
      headers: { "X-Shopify-Access-Token": config.token },
    });
    
    if (!blogsResponse.ok) {
      const status = blogsResponse.status;
      const errorText = await blogsResponse.text();
      console.error(`[Shopify] Failed to get blogs: ${status} - ${errorText}`);
      
      if (status === 401) {
        return { success: false, message: "Invalid Admin API Access Token. Create a new token in your Shopify app." };
      } else if (status === 404) {
        return { success: false, message: "Store not found. Check your Store URL (must be your-store.myshopify.com)." };
      }
      return { success: false, message: `Failed to access Shopify store (${status}): ${errorText.substring(0, 100)}` };
    }
    
    const blogsData = await blogsResponse.json();
    const blogId = blogsData.blogs?.[0]?.id;
    
    if (!blogId) {
      return { success: false, message: "No blog found in your Shopify store. Create a blog first in Online Store → Blog Posts." };
    }

    console.log(`[Shopify] Using blog ID: ${blogId}`);
    
    const response = await fetch(`${storeUrl}/admin/api/2024-01/blogs/${blogId}/articles.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": config.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        article: {
          title: content.title,
          body_html: content.body,
          published: true,
        },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();
      console.error(`[Shopify] Article creation failed (${status}): ${errorText}`);
      
      if (status === 422) {
        return { success: false, message: "Invalid article data. Check title and content format." };
      }
      return { success: false, message: `Shopify API error (${status}): ${errorText.substring(0, 200)}` };
    }

    const data = await response.json();
    console.log(`[Shopify] Published successfully: ${data.article.id}`);
    return {
      success: true,
      publishedId: String(data.article.id),
      publishedUrl: `${storeUrl}/blogs/news/${data.article.handle}`,
    };
  } catch (error) {
    console.error("[Shopify] Exception:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Shopify publish failed - network error",
    };
  }
}

async function publishToWix(
  content: { title: string; body: string },
  config: Record<string, string>
): Promise<{ success: boolean; publishedUrl?: string; publishedId?: string; message?: string }> {
  const apiKey = config.token?.trim();
  const siteId = config.siteId?.trim();

  if (!apiKey) {
    return { success: false, message: "Wix API Key required" };
  }

  if (!apiKey.startsWith("IST.")) {
    return { success: false, message: "Invalid API Key format. Wix API Keys should start with 'IST.'" };
  }

  if (!siteId) {
    return { success: false, message: "Wix Site ID required" };
  }

  try {
    console.log(`[Wix] Publishing to site: ${siteId.substring(0, 8)}...`);

    const response = await fetch(`https://www.wixapis.com/blog/v3/posts`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "wix-site-id": siteId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        post: {
          title: content.title,
          richContent: {
            nodes: [
              {
                type: "PARAGRAPH",
                nodes: [{ type: "TEXT", textData: { text: content.body } }],
              },
            ],
          },
        },
        publish: true,
      }),
    });

    console.log(`[Wix] Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[Wix] Error:`, JSON.stringify(errorData));
      
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: "API Key invalide ou permissions insuffisantes. Vérifiez les permissions Blog." };
      }
      return { success: false, message: `Wix API error (${response.status}): ${errorData.message || response.statusText}` };
    }

    const data = await response.json();
    console.log(`[Wix] Published successfully: ${data.post?.id}`);
    return {
      success: true,
      publishedId: data.post?.id,
      publishedUrl: data.post?.url,
    };
  } catch (error) {
    console.error("[Wix] Exception:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Wix publish failed",
    };
  }
}

async function publishToWebhook(
  content: { title: string; body: string },
  config: Record<string, string>
): Promise<{ success: boolean; publishedUrl?: string; publishedId?: string; message?: string }> {
  if (!config.endpoint) {
    throw new Error("Webhook URL required");
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (config.token) {
      headers["Authorization"] = `Bearer ${config.token}`;
    }

    const response = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: content.title,
        content: content.body,
        publishedAt: new Date().toISOString(),
        source: "AEO Planning",
      }),
    });

    // For webhooks, we consider it successful if the request was sent
    return {
      success: true,
      message: "Webhook triggered successfully",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Webhook failed",
    };
  }
}

async function publishToCustomApi(
  content: { title: string; body: string },
  config: Record<string, string>
): Promise<{ success: boolean; publishedUrl?: string; publishedId?: string; message?: string }> {
  if (!config.endpoint) {
    throw new Error("API endpoint required");
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (config.token) {
      headers["Authorization"] = config.token;
    }

    const method = config.method?.toUpperCase() || "POST";

    const response = await fetch(config.endpoint, {
      method,
      headers,
      body: JSON.stringify({
        title: content.title,
        content: content.body,
        publishedAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      publishedId: data.id,
      publishedUrl: data.url,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "API publish failed",
    };
  }
}

async function publishToDuda(
  content: { title: string; body: string },
  config: Record<string, string>
): Promise<{ success: boolean; publishedUrl?: string; publishedId?: string; message?: string }> {
  if (!config.endpoint || !config.token) {
    throw new Error("Duda site name and API key required");
  }

  try {
    const response = await fetch(
      `https://api.duda.co/api/sites/multiscreen/${config.endpoint}/blog/posts`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${config.token}:`)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: content.title,
          content: content.body,
          status: "published",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Duda API error: ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      publishedId: data.id,
      publishedUrl: data.url,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Duda publish failed",
    };
  }
}

async function publishToBigCommerce(
  content: { title: string; body: string },
  config: Record<string, string>
): Promise<{ success: boolean; publishedUrl?: string; publishedId?: string; message?: string }> {
  if (!config.endpoint || !config.token) {
    throw new Error("BigCommerce store hash and token required");
  }

  try {
    const response = await fetch(
      `https://api.bigcommerce.com/stores/${config.endpoint}/v2/blog/posts`,
      {
        method: "POST",
        headers: {
          "X-Auth-Token": config.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: content.title,
          body: content.body,
          is_published: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BigCommerce API error: ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      publishedId: String(data.id),
      publishedUrl: data.url,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "BigCommerce publish failed",
    };
  }
}

async function publishToLovable(
  content: { title: string; body: string },
  config: Record<string, string>,
  sourceId?: string,
  slug?: string
): Promise<{ success: boolean; publishedUrl?: string; publishedId?: string; message?: string }> {
  // For Lovable-hosted sites, use the published site URL with /blog/:slug route
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // If user has configured a custom endpoint (external Lovable project), use webhook
    if (config.endpoint && !config.endpoint.includes(supabaseUrl)) {
      // External Lovable project - send via webhook
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (config.token) {
          headers["Authorization"] = `Bearer ${config.token}`;
        }
        
        // Generate slug from title or use provided slug
        let articleSlug = slug;
        if (!articleSlug && sourceId) {
          // Try to get slug from answer
          const { data: answer } = await supabase
            .from("answers")
            .select("slug")
            .eq("id", sourceId)
            .single();
          articleSlug = answer?.slug;
        }
        // Fallback: generate slug from title
        if (!articleSlug) {
          articleSlug = content.title
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
            .replace(/\s+/g, "-") // Replace spaces with hyphens
            .replace(/-+/g, "-") // Replace multiple hyphens
            .replace(/^-|-$/g, "") // Trim hyphens
            .substring(0, 80); // Limit length
        }
        
        const normalizedBody = normalizeEditorialBody(content.body);
        const response = await fetch(config.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: content.title,
            body: normalizedBody,
            slug: articleSlug,
            sourceId: sourceId,
            publishedAt: new Date().toISOString(),
            source: "AutoPilot Geo",
            renderMode: "magazine",
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Lovable] External endpoint error: ${errorText}`);
          return { success: false, message: `External Lovable endpoint error: ${errorText.substring(0, 100)}` };
        }
        
        const data = await response.json().catch(() => ({}));
        console.log(`[Lovable] Published to external Lovable project with slug: ${articleSlug}`, JSON.stringify(data).slice(0, 300));

        // ALWAYS prefer the project's own website_url over whatever the receiving
        // endpoint returns (some receivers return a wrong/stale lovable.app domain).
        // Priority: config.siteUrl > project.website_url > data.article?.url || data.url > fallback
        let publicUrl: string | undefined;

        if (config.siteUrl) {
          publicUrl = `${config.siteUrl.replace(/\/+$/, '')}/blog/${articleSlug}`;
        } else if (sourceId) {
          const { data: answerProject } = await supabase
            .from("answers")
            .select("projects(website_url)")
            .eq("id", sourceId)
            .single();
          let projectUrl = (answerProject?.projects as any)?.website_url;
          if (!projectUrl) {
            const { data: articleProject } = await supabase
              .from("articles")
              .select("projects(website_url)")
              .eq("id", sourceId)
              .single();
            projectUrl = (articleProject?.projects as any)?.website_url;
          }
          if (projectUrl) {
            publicUrl = `${projectUrl.replace(/\/+$/, '')}/blog/${articleSlug}`;
          }
        }

        // Last-resort fallbacks: response payload, then relative path
        if (!publicUrl) {
          publicUrl = data.article?.url || data.url || `/blog/${articleSlug}`;
        }
        
        return {
          success: true,
          publishedUrl: publicUrl,
          publishedId: sourceId,
          message: "Content published to external Lovable project",
        };
      } catch (error) {
        console.error("[Lovable] External publish error:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to publish to external Lovable project",
        };
      }
    }
    
    // Internal Lovable site - use the published site URL with /blog/:slug route
    // Get the slug from database (try answers first, then articles)
    let contentSlug = slug;
    if (!contentSlug && sourceId) {
      // Try answers first
      const { data: answer } = await supabase
        .from("answers")
        .select("slug")
        .eq("id", sourceId)
        .single();
      contentSlug = answer?.slug;
      
      // If not found in answers, try articles
      if (!contentSlug) {
        const { data: article } = await supabase
          .from("articles")
          .select("slug")
          .eq("id", sourceId)
          .single();
        contentSlug = article?.slug;
      }
    }
    
    // Final fallback: generate slug from title
    if (!contentSlug) {
      contentSlug = content.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 80);
      console.log(`[Lovable] Generated fallback slug from title: ${contentSlug}`);
    }
    
    // Use the published site URL (configured in integration, or from project's website_url)
    let siteUrl = config.siteUrl?.replace(/\/+$/, '');
    
    // If no siteUrl in config, try to get it from the project's website_url
    if (!siteUrl && sourceId) {
      // Try answers first to get project website_url
      const { data: answerProject } = await supabase
        .from("answers")
        .select("projects(website_url)")
        .eq("id", sourceId)
        .single();
      
      const projectUrl = (answerProject?.projects as any)?.website_url;
      if (projectUrl) {
        siteUrl = projectUrl.replace(/\/+$/, '');
      } else {
        // Try articles
        const { data: articleProject } = await supabase
          .from("articles")
          .select("projects(website_url)")
          .eq("id", sourceId)
          .single();
        const artUrl = (articleProject?.projects as any)?.website_url;
        if (artUrl) {
          siteUrl = artUrl.replace(/\/+$/, '');
        }
      }
    }
    
    if (!siteUrl) {
      siteUrl = "https://autopilotgeom";
    }
    
    const publishedUrl = `${siteUrl}/blog/${contentSlug}`;
    
    // === EDITORIAL TEMPLATE COMPATIBILITY ===
    // Strip <h1> from body since ArticleTemplate renders the title as a hero header
    // Also strip full HTML document wrappers (<!DOCTYPE>, <html>, <head>, <body>) if present
    let cleanBody = content.body;
    
    // If body is a full HTML document, extract just the article content
    if (cleanBody.includes('<!DOCTYPE') || cleanBody.includes('<html')) {
      // Try to extract content from <main> or <article> or <body>
      const mainMatch = cleanBody.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      const articleMatch = cleanBody.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      const bodyMatch = cleanBody.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      
      if (mainMatch) {
        cleanBody = mainMatch[1];
      } else if (articleMatch) {
        cleanBody = articleMatch[1];
      } else if (bodyMatch) {
        cleanBody = bodyMatch[1];
      }
      console.log(`[Lovable] Stripped full HTML document wrapper`);
    }
    
    cleanBody = normalizeEditorialBody(cleanBody);
    
    // === CRITICAL: Insert into published_articles so the blog page can find it ===
    const metaDescription = cleanBody
      .replace(/<[^>]*>/g, "")
      .slice(0, 160)
      .trim();
    
    const { error: insertError } = await supabase
      .from("published_articles")
      .upsert({
        slug: contentSlug,
        title: content.title,
        body: cleanBody,
        meta_description: metaDescription,
        published_at: new Date().toISOString(),
        source_id: sourceId || null,
      }, { onConflict: "slug" });
    
    if (insertError) {
      console.error(`[Lovable] Error inserting into published_articles:`, insertError);
    } else {
      console.log(`[Lovable] Inserted into published_articles: ${contentSlug}`);
    }
    
    // === Also mark the linked answer as public so AeoPublicAnswer can find it ===
    if (sourceId) {
      const { error: answerUpdateError } = await supabase
        .from("answers")
        .update({ 
          is_public: true, 
          published_at: new Date().toISOString(),
          published_url: publishedUrl 
        })
        .eq("id", sourceId);
      
      if (answerUpdateError) {
        console.error(`[Lovable] Error updating answer:`, answerUpdateError);
      } else {
        console.log(`[Lovable] Marked answer ${sourceId} as public`);
      }
    }
    
    console.log(`[Lovable] Content published at: ${publishedUrl}`);
    
    return {
      success: true,
      publishedUrl,
      publishedId: sourceId,
      message: "Content published to Lovable site",
    };
  } catch (error) {
    console.error("[Lovable] Publish error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Lovable publish failed",
    };
  }
}

// ============ HTML Generation Functions for GET requests ============

function generateErrorHTML(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | LAAAutoPilot Geoitle>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 2rem; }
    .container { max-width: 500px; background: white; border-radius: 16px; padding: 3rem; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
    h1 { color: #1e293b; font-size: 1.5rem; margin-bottom: 1rem; }
    p { color: #64748b; line-height: 1.6; margin-bottom: 2rem; }
    a { display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 500; }
    a:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://laautopilotgeo.com">← Back to AutoPilot Geo>
  </div>
</body>
</html>`;
}

function generatePublicAnswerHTML(answer: any): string {
  const question = answer.question || "Question";
  const answerText = answer.answer || "";
  const brandName = answer.projects?.brand_name || "AutoPilot Geo";
  const language = answer.projects?.language || "en";
  const createdAt = new Date(answer.created_at).toLocaleDateString(language === "fr" ? "fr-FR" : "en-US", {
    year: "numeric", month: "long", day: "numeric"
  });
  
  // Extract supporting content
  const bullets = (answer.supporting_content as any)?.bullets || [];
  const faq = (answer.supporting_content as any)?.faq || [];
  
  // JSON-LD structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "QAPage",
    "mainEntity": {
      "@type": "Question",
      "name": question,
      "dateCreated": answer.created_at,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": answerText,
        "dateCreated": answer.created_at,
        "author": { "@type": "Organization", "name": brandName }
      }
    }
  };

  const faqJsonLd = faq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map((f: any) => ({
      "@type": "Question",
      "name": f.q || f.question,
      "acceptedAnswer": { "@type": "Answer", "text": f.a || f.answer }
    }))
  } : null;

  const keyPointsTitle = language === "fr" ? "Points Clés" : "Key Points";
  const faqTitle = language === "fr" ? "Questions Fréquentes" : "Frequently Asked Questions";
  const publishedLabel = language === "fr" ? "Publié le" : "Published on";
  const sourceLabel = language === "fr" ? "Source" : "Source";

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${question} | ${brandName}</title>
  <meta name="description" content="${answerText.slice(0, 160)}">
  <meta property="og:title" content="${question}">
  <meta property="og:description" content="${answerText.slice(0, 160)}">
  <meta property="og:type" content="article">
  <meta name="robots" content="index, follow">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${faqJsonLd ? `<script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>` : ""}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: linear-gradient(135deg, #fafafa 0%, #f0f0ff 100%); min-height: 100vh; color: #1a1a2e; }
    header { background: white; border-bottom: 1px solid #e5e5e5; padding: 1rem 2rem; }
    .header-content { max-width: 800px; margin: 0 auto; display: flex; align-items: center; gap: 0.5rem; }
    .logo { width: 32px; height: 32px; background: linear-gradient(135deg, #8b5cf6, #3b82f6); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; }
    .brand-name { font-weight: 600; color: #1a1a2e; }
    main { max-width: 800px; margin: 0 auto; padding: 3rem 1.5rem; }
    h1 { font-size: 2rem; line-height: 1.3; margin-bottom: 2rem; color: #1a1a2e; }
    .answer-box { background: white; border-left: 4px solid #8b5cf6; padding: 2rem; border-radius: 0 12px 12px 0; margin-bottom: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
    .answer-box p { font-size: 1.125rem; line-height: 1.8; color: #374151; white-space: pre-wrap; }
    .key-points { background: #fefce8; border: 1px solid #fef08a; padding: 1.5rem; border-radius: 12px; margin: 2rem 0; }
    .key-points h2 { font-size: 1.125rem; color: #854d0e; margin-bottom: 1rem; }
    .key-points ul { padding-left: 1.25rem; }
    .key-points li { color: #713f12; margin-bottom: 0.5rem; line-height: 1.6; }
    .faq-section { margin: 2rem 0; }
    .faq-section h2 { font-size: 1.25rem; margin-bottom: 1rem; color: #1a1a2e; }
    .faq-item { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 0.75rem; overflow: hidden; background: white; }
    .faq-item summary { padding: 1rem; cursor: pointer; font-weight: 500; list-style: none; }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item summary:hover { background: #f9fafb; }
    .faq-item[open] summary { border-bottom: 1px solid #e5e7eb; }
    .faq-item p { padding: 1rem; color: #6b7280; line-height: 1.6; }
    .meta { border-top: 1px solid #e5e7eb; padding-top: 2rem; margin-top: 2rem; color: #6b7280; font-size: 0.875rem; }
    .meta strong { color: #374151; }
    footer { border-top: 1px solid #e5e7eb; background: white; padding: 2rem; text-align: center; }
    footer p { color: #6b7280; margin-bottom: 1rem; }
    footer a { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #3b82f6); color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 500; }
    footer a:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <div class="logo">L</div>
      <span class="brand-name">AutoPilot Geo</span>
    </div>
  </header>
  <main>
    <article>
      <h1>${question}</h1>
      <div class="answer-box">
        <p>${answerText}</p>
      </div>
      ${bullets.length > 0 ? `
      <section class="key-points">
        <h2>${keyPointsTitle}</h2>
        <ul>${bullets.map((b: string) => `<li>${b}</li>`).join("")}</ul>
      </section>` : ""}
      ${faq.length > 0 ? `
      <section class="faq-section">
        <h2>${faqTitle}</h2>
        ${faq.map((f: any) => `
        <details class="faq-item">
          <summary>${f.q || f.question}</summary>
          <p>${f.a || f.answer}</p>
        </details>`).join("")}
      </section>` : ""}
      <div class="meta">
        <p><strong>${sourceLabel}:</strong> ${brandName}</p>
        <p>${publishedLabel} ${createdAt}</p>
      </div>
    </article>
  </main>
  <footer>
    <p>Optimize your AI visibility with AutoPilot Geo</p>
    <a href="https://autopilotgeo.com">Create Your AEO Answers</a>
  </footer>
</body>
</html>`;
}

function generatePublicArticleHTML(article: any): string {
  const title = article.title || "Article";
  const content = article.html_content || article.content || "";
  const brandName = article.projects?.brand_name || "AutoPilot Geo";
  const language = article.projects?.language || "en";
  const metaDescription = article.meta_description || content.replace(/<[^>]*>/g, "").slice(0, 160);
  const createdAt = new Date(article.created_at).toLocaleDateString(language === "fr" ? "fr-FR" : "en-US", {
    year: "numeric", month: "long", day: "numeric"
  });

  const publishedLabel = language === "fr" ? "Publié le" : "Published on";
  const sourceLabel = language === "fr" ? "Source" : "Source";

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | ${brandName}</title>
  <meta name="description" content="${metaDescription}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:type" content="article">
  <meta name="robots" content="index, follow">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fafafa; min-height: 100vh; color: #1a1a2e; }
    header { background: white; border-bottom: 1px solid #e5e5e5; padding: 1rem 2rem; }
    .header-content { max-width: 800px; margin: 0 auto; display: flex; align-items: center; gap: 0.5rem; }
    .logo { width: 32px; height: 32px; background: linear-gradient(135deg, #8b5cf6, #3b82f6); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; }
    .brand-name { font-weight: 600; color: #1a1a2e; }
    main { max-width: 800px; margin: 0 auto; padding: 3rem 1.5rem; }
    article { background: white; border-radius: 12px; padding: 2.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
    h1 { font-size: 2rem; line-height: 1.3; margin-bottom: 2rem; color: #1a1a2e; }
    .content { line-height: 1.8; color: #374151; }
    .content h2 { font-size: 1.5rem; margin: 2rem 0 1rem; color: #1a1a2e; }
    .content h3 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; color: #1a1a2e; }
    .content p { margin-bottom: 1rem; }
    .content ul, .content ol { margin-bottom: 1rem; padding-left: 1.5rem; }
    .content li { margin-bottom: 0.5rem; }
    .content a { color: #8b5cf6; }
    .meta { border-top: 1px solid #e5e7eb; padding-top: 2rem; margin-top: 2rem; color: #6b7280; font-size: 0.875rem; }
    .meta strong { color: #374151; }
    footer { border-top: 1px solid #e5e7eb; background: white; padding: 2rem; text-align: center; margin-top: 2rem; }
    footer p { color: #6b7280; margin-bottom: 1rem; }
    footer a { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #3b82f6); color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 500; }
    footer a:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <div class="logo">L</div>
      <span class="brand-name">AutoPilot Geo</span>
    </div>
  </header>
  <main>
    <article>
      <h1>${title}</h1>
      <div class="content">${content}</div>
      <div class="meta">
        <p><strong>${sourceLabel}:</strong> ${brandName}</p>
        <p>${publishedLabel} ${createdAt}</p>
      </div>
    </article>
  </main>
  <footer>
    <p>Optimize your AI visibility with AutoPilot Geo</p>
    <a href="https://autopilotgeo.com">Create Your AEO Articles</a>
  </footer>
</body>
</html>`;
}
