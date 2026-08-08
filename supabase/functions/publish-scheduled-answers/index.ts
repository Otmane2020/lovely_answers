import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Answer {
  id: string;
  project_id: string;
  question: string;
  answer: string;
  slug: string;
  article_id: string | null;
  supporting_content: {
    bullets?: string[];
    faq?: { question?: string; q?: string; answer?: string; a?: string }[];
  };
  scheduled_date: string;
}

interface Article {
  id: string;
  project_id: string;
  title: string;
  content: string | null;
  html_content: string | null;
  scheduled_date: string;
  linked_answer_id: string | null;
  slug?: string | null;
}

interface LocalAnswer {
  id: string;
  project_id: string;
  business_id: string;
  business_name: string;
  question: string;
  answer: string;
  slug: string;
  scheduled_date: string;
}

interface Integration {
  id: string;
  platform: string;
  config: Record<string, string>;
  is_connected: boolean;
}

interface Project {
  id: string;
  brand_name: string | null;
  name: string;
  website_url: string;
  language: string;
}

interface ProjectSettings {
  project_id: string;
  auto_publish_enabled: boolean;
  publish_hour: string;
  timezone: string | null;
  publish_frequency: string | null;
}

// Convert UTC time to local hour in a specific timezone
function getLocalHour(timezone: string): number {
  try {
    const now = new Date();
    // Use numeric hour to avoid locale issues with "24" vs "00"
    const formatter = new Intl.DateTimeFormat("en-US", { 
      timeZone: timezone, 
      hour: "numeric", 
      hour12: false 
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(p => p.type === "hour");
    const hour = parseInt(hourPart?.value || "0", 10);
    // Handle midnight: some locales return 24 instead of 0
    return hour === 24 ? 0 : hour;
  } catch (e) {
    console.error(`[publish-scheduled] ⚠️ Invalid timezone: ${timezone}, falling back to UTC`);
    return new Date().getUTCHours();
  }
}

// Check if today matches the frequency schedule
function shouldPublishToday(frequency: string | null): boolean {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayOfMonth = today.getDate();
  
  switch (frequency) {
    case "weekly":
      // Publish only on Mondays (day 1)
      return dayOfWeek === 1;
    case "monthly":
      // Publish only on the 1st of the month
      return dayOfMonth === 1;
    case "2x_week":
      // Publish on Tuesdays (2) and Thursdays (4)
      return dayOfWeek === 2 || dayOfWeek === 4;
    case "3x_week":
      // Publish on Mondays (1), Wednesdays (3), Fridays (5) — Google HCU recommended
      return dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5;
    case "daily":
    default:
      // Daily publishing
      return true;
  }
}

// Strip HTML to get a clean plain-text excerpt
function plainExcerpt(html: string, max = 160): string {
  const text = (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function normalizeEditorialHtml(input: string): string {
  let html = (input || "").trim();
  if (!html) return "";
  html = html.replace(/<!doctype[^>]*>/gi, "");
  html = html.replace(/<\/?(?:html|head|body)[^>]*>/gi, "");
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "");
  html = html.replace(/<\/?(?:article|section)[^>]*>/gi, "");
  html = html.replace(/\sstyle\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\sstyle\s*=\s*'[^']*'/gi, "");
  html = html.replace(/(^|\n)\s*#{2}\s+(.+)$/gm, "$1<h2>$2</h2>");
  html = html.replace(/(^|\n)\s*#{3}\s+(.+)$/gm, "$1<h3>$2</h3>");
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|\n)\s*(Opening Summary|Comparison Criteria|Tool Solutions for Enterprise Content Strategy|Brand|ChatGPT \(OpenAI\)|Gemini \(Google\)|Perplexity AI|Comparison Table|How to Choose the Right AI for Your Enterprise|FAQ)\s*$/gmi, "$1<h2>$2</h2>");
  html = html.split(/\n{2,}/).map((chunk) => {
    const text = chunk.trim();
    if (!text) return "";
    if (/^<(h[1-6]|p|ul|ol|li|blockquote|table|thead|tbody|tr|div|details|summary)/i.test(text)) return text;
    return `<p>${text.replace(/\n+/g, "<br>")}</p>`;
  }).filter(Boolean).join("\n\n");
  return html.replace(/\n{3,}/g, "\n\n").trim();
}

// HTML escape for safe interpolation in attributes/text
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateAnswerHTML(
  answer: Answer,
  project: Project
): { title: string; body: string; excerpt: string } {
  const { question, answer: answerText, supporting_content } = answer;
  const brandName = project.brand_name || project.name;
  const websiteUrl = project.website_url;
  const language = project.language || "fr";

  const bullets = supporting_content?.bullets || [];
  const rawFaq = supporting_content?.faq || [];
  const faq = rawFaq.map(item => ({
    question: item.question || item.q || "",
    answer: item.answer || item.a || ""
  })).filter(item => item.question && item.answer);

  const qaJsonLd = {
    "@context": "https://schema.org",
    "@type": "QAPage",
    "mainEntity": {
      "@type": "Question",
      "name": question,
      "text": question,
      "dateCreated": new Date().toISOString(),
      "answerCount": 1,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": answerText,
        "dateCreated": new Date().toISOString(),
        "author": { "@type": "Organization", "name": brandName, "url": websiteUrl }
      }
    }
  };

  const faqJsonLd = faq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map(item => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": { "@type": "Answer", "text": item.answer }
    }))
  } : null;

  const keyPointsTitle = language === "fr" ? "Points clés" : "Key takeaways";
  const faqTitle = language === "fr" ? "Questions fréquentes" : "Frequently asked questions";
  const inDepthTitle = language === "fr" ? "Analyse détaillée" : "In-depth analysis";
  const conclusionTitle = language === "fr" ? "À retenir" : "Bottom line";

  // Split answer into intro (1st sentence) + rest for magazine layout
  const sentences = answerText.match(/[^.!?]+[.!?]+/g) || [answerText];
  const leadSentence = (sentences[0] || answerText).trim();
  const restOfAnswer = sentences.slice(1).join(" ").trim();

  // aeo-answer pull paragraph (citable)
  const aeoAnswerBlock = `<p class="aeo-answer"><strong>${esc(leadSentence)}</strong>${restOfAnswer ? " " + esc(restOfAnswer) : ""}</p>`;

  // aeo-summary takeaways box
  const summaryBlock = bullets.length > 0
    ? `<div class="aeo-summary">\n<p><strong>${keyPointsTitle}:</strong></p>\n<ul>\n${bullets.map(b => `  <li>${esc(b)}</li>`).join("\n")}\n</ul>\n</div>`
    : "";

  // Editorial H2 sections — promote each bullet to a section heading with a short paragraph
  const sectionsBlock = bullets.length > 0
    ? `<h2>${inDepthTitle}</h2>\n` + bullets.map((b, i) => {
        const text = String(b || "").trim();
        // Use bullet sentence as H3 lead, then expand with the bullet as paragraph
        const heading = text.replace(/^[-•*]\s*/, "").split(/[.:]/)[0].slice(0, 80) || `${language === "fr" ? "Point" : "Point"} ${i + 1}`;
        return `<h3>${esc(heading)}</h3>\n<p>${esc(text)}</p>`;
      }).join("\n\n")
    : "";

  // FAQ accordion using <details> (rendered as expandable by ArticleTemplate/.editorial-prose)
  const faqBlock = faq.length > 0
    ? `<h2>${faqTitle}</h2>\n${faq.map(item => `<details class="faq-item"><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join("\n")}`
    : "";

  // Conclusion pull-quote
  const conclusionBlock = `<h2>${conclusionTitle}</h2>\n<blockquote>${esc(leadSentence)}</blockquote>`;

  // Magazine layout: aeo-answer → aeo-summary → in-depth sections → FAQ → conclusion
  const body = [
    `<script type="application/ld+json">${JSON.stringify(qaJsonLd)}</script>`,
    faqJsonLd ? `<script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>` : "",
    aeoAnswerBlock,
    summaryBlock,
    sectionsBlock,
    faqBlock,
    conclusionBlock,
  ].filter(Boolean).join("\n\n");

  return { title: question, body, excerpt: plainExcerpt(answerText) };
}

function generateArticleHTML(
  article: Article,
  _project: Project
): { title: string; body: string; excerpt: string } {
  // Use existing HTML content when available; otherwise convert markdown-ish to HTML
  let html = article.html_content?.trim() || "";
  if (!html) {
    const content = article.content || "";
    html = content
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .split(/\n{2,}/)
      .map(p => p.startsWith("<") ? p : `<p>${p.trim()}</p>`)
      .join("\n");
  }
  // Normalize generated/markdown-ish content into the editorial magazine body.
  html = normalizeEditorialHtml(html);
  return { title: article.title, body: html, excerpt: plainExcerpt(html) };
}

function generateLocalAnswerHTML(
  localAnswer: LocalAnswer,
  project: Project
): { title: string; body: string; excerpt: string } {
  const { question, answer, business_name } = localAnswer;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": business_name,
    "url": project.website_url,
    "mainEntity": {
      "@type": "Question",
      "name": question,
      "acceptedAnswer": { "@type": "Answer", "text": answer }
    }
  };
  const body = [
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    `<p><strong>${esc(business_name)}</strong></p>`,
    `<blockquote>${esc(answer)}</blockquote>`,
  ].join("\n\n");
  return { title: question, body, excerpt: plainExcerpt(answer) };
}

function buildPublicBlogUrl(baseUrl: string | null | undefined, slug: string | null | undefined) {
  if (!baseUrl || !slug) return null;
  return `${baseUrl.replace(/\/+$/, "")}/blog/${slug}`;
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for manual trigger
    let forceToday = false;
    let forceProjectId: string | null = null;
    let targetDate: string | null = null;
    try {
      const body = await req.json();
      forceToday = body?.forceToday === true;
      forceProjectId = body?.projectId || null;
      targetDate = body?.targetDate || null;
    } catch {
      // No body or invalid JSON - that's fine for cron calls
    }

    const today = new Date();
    // Use targetDate if provided (for retroactive publishing), otherwise use today
    const todayStr = targetDate || today.toISOString().split('T')[0];
    const currentUtcHour = today.getUTCHours();
    
    console.log(`[publish-scheduled] 🚀 Starting auto-publish`);
    console.log(`[publish-scheduled] Date: ${todayStr}, UTC Hour: ${currentUtcHour}`);
    console.log(`[publish-scheduled] Manual trigger: forceToday=${forceToday}, projectId=${forceProjectId}, targetDate=${targetDate}`);

    // Get ALL projects with auto-publish enabled (we'll filter by timezone below)
    const { data: projectSettings, error: settingsError } = await supabase
      .from("project_settings")
      .select("project_id, publish_hour, timezone, publish_frequency")
      .eq("auto_publish_enabled", true);

    if (settingsError) {
      console.error("[publish-scheduled] ❌ Error fetching project settings:", settingsError);
      throw settingsError;
    }

    console.log(`[publish-scheduled] 📊 Found ${projectSettings?.length || 0} projects with auto-publish enabled`);

    // Filter projects where the LOCAL hour matches the configured publish_hour
    // OR if forceToday is true and projectId matches
    let projectsToPublish: ProjectSettings[] = [];
    
    if (forceToday || targetDate) {
      // Manual trigger OR retroactive publishing - bypass hour check
      if (forceProjectId) {
        // Specific project
        const matchingProject = (projectSettings || []).find(ps => ps.project_id === forceProjectId);
        if (matchingProject) {
          projectsToPublish.push(matchingProject as ProjectSettings);
          console.log(`[publish-scheduled] 🔧 MANUAL TRIGGER: Publishing for project ${forceProjectId}`);
        } else {
          projectsToPublish.push({
            project_id: forceProjectId,
            publish_hour: "00",
            auto_publish_enabled: true,
            timezone: "UTC",
            publish_frequency: "daily"
          });
          console.log(`[publish-scheduled] 🔧 MANUAL TRIGGER: Force publishing for project ${forceProjectId}`);
        }
      } else {
        // All projects with auto-publish enabled
        for (const ps of projectSettings || []) {
          projectsToPublish.push(ps as ProjectSettings);
        }
        console.log(`[publish-scheduled] 🔧 RETROACTIVE: Publishing for ALL ${projectsToPublish.length} projects for date ${todayStr}`);
      }
    } else {
      // Normal cron behavior - check hour and frequency for each project's timezone
      for (const ps of projectSettings || []) {
        const timezone = ps.timezone || "UTC";
        const localHour = getLocalHour(timezone);
        const configuredHour = parseInt(ps.publish_hour || "10", 10);
        const frequency = (ps as any).publish_frequency || "daily";
        
        console.log(`[publish-scheduled] 🕐 Project ${ps.project_id}: timezone=${timezone}, localHour=${localHour}, publishHour=${configuredHour}, frequency=${frequency}`);
        
        // Check both hour match AND frequency match
        if (localHour === configuredHour && shouldPublishToday(frequency)) {
          projectsToPublish.push(ps as ProjectSettings);
          console.log(`[publish-scheduled] ✅ Project ${ps.project_id} MATCHED for publication`);
        } else if (localHour === configuredHour) {
          console.log(`[publish-scheduled] ⏭️ Project ${ps.project_id} skipped - frequency=${frequency} not matched today`);
        }
      }
    }

    console.log(`[publish-scheduled] 📊 ${projectsToPublish.length} projects to publish`);

    // FALLBACK: If no project_settings exist, find all projects with active integrations
    if (!projectSettings || projectSettings.length === 0) {
      console.log(`[publish-scheduled] ⚠️ No project_settings found, using FALLBACK mode`);
      
      // Only run fallback at 10:00 UTC (default hour)
      if (currentUtcHour === 10) {
        const { data: projectsWithIntegrations } = await supabase
          .from("integrations")
          .select("project_id")
          .eq("is_connected", true);
        
        if (projectsWithIntegrations && projectsWithIntegrations.length > 0) {
          const uniqueProjectIds = [...new Set(projectsWithIntegrations.map(i => i.project_id))];
          projectsToPublish = uniqueProjectIds.map(pid => ({ 
            project_id: pid, 
            publish_hour: "10", 
            auto_publish_enabled: true, 
            timezone: "UTC",
            publish_frequency: "daily"
          }));
          console.log(`[publish-scheduled] 🔄 FALLBACK: Found ${projectsToPublish.length} projects with active integrations`);
        }
      }
    }

    if (projectsToPublish.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `No projects scheduled for current hour (UTC: ${currentUtcHour})`, 
          published: 0,
          currentUtcHour,
          totalProjects: projectSettings?.length || 0,
          fallbackUsed: !projectSettings || projectSettings.length === 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const projectIds = projectsToPublish.map(ps => ps.project_id);

    // IMPORTANT: Read schedule from BOTH `planning_days` (legacy) and `planning`
    // (used by daily-planning-fill). They share the same shape (project_id +
    // date + answer_id + article_id), only the date column name differs.
    const [
      { data: planningDaysRows, error: planningDaysError },
      { data: planningRows2, error: planningError2 },
    ] = await Promise.all([
      supabase
        .from("planning_days")
        .select("project_id, scheduled_date, answer_id, article_id")
        .in("project_id", projectIds)
        .eq("scheduled_date", todayStr),
      supabase
        .from("planning")
        .select("project_id, day, answer_id, article_id")
        .in("project_id", projectIds)
        .eq("day", todayStr),
    ]);

    if (planningDaysError) {
      console.error("[publish-scheduled] ❌ Error fetching planning_days:", planningDaysError);
    }
    if (planningError2) {
      console.error("[publish-scheduled] ❌ Error fetching planning:", planningError2);
    }

    const planningRows = [
      ...(planningDaysRows || []),
      ...(planningRows2 || []).map((r: any) => ({
        project_id: r.project_id,
        scheduled_date: r.day,
        answer_id: r.answer_id,
        article_id: r.article_id,
      })),
    ];

    const answerIds = [...new Set(planningRows.map((r: any) => r.answer_id).filter(Boolean))];
    const articleIds = [...new Set(planningRows.map((r: any) => r.article_id).filter(Boolean))];

    // Fetch answers/articles by IDs only (no scheduled_date filtering here)
    // Also fetch local_answers directly by scheduled_date (they don't use planning_days)
    const [
      { data: answers, error: answersError }, 
      { data: articles, error: articlesError },
      { data: localAnswers, error: localAnswersError }
    ] = await Promise.all([
      answerIds.length
        ? supabase
            .from("answers")
            .select("*")
            .in("id", answerIds)
            .eq("is_public", false)
        : Promise.resolve({ data: [], error: null }),
      articleIds.length
        ? supabase
            .from("articles")
            .select("*")
            .in("id", articleIds)
            .neq("status", "published")
        : Promise.resolve({ data: [], error: null }),
      // Local answers: fetch by scheduled_date and project_ids directly
      supabase
        .from("local_answers")
        .select("*")
        .in("project_id", projectIds)
        .eq("scheduled_date", todayStr)
        .eq("is_public", false)
    ]);

    if (answersError) {
      console.error("[publish-scheduled] ❌ Error fetching answers:", answersError);
    }
    if (articlesError) {
      console.error("[publish-scheduled] ❌ Error fetching articles:", articlesError);
    }
    if (localAnswersError) {
      console.error("[publish-scheduled] ❌ Error fetching local_answers:", localAnswersError);
    }

    console.log(`[publish-scheduled] 📝 Found ${answers?.length || 0} answers (violet), ${articles?.length || 0} articles (emerald), ${localAnswers?.length || 0} local answers (orange) to publish`);

    const results: { id: string; type: "answer" | "article" | "local-answer"; success: boolean; url?: string; error?: string }[] = [];

    // Process answers (violet items)
    for (const answer of answers || []) {
      try {
        console.log(`[publish-scheduled] 💜 Processing answer: ${answer.question.substring(0, 50)}...`);
        
        // Get project info
        const { data: project } = await supabase
          .from("projects")
          .select("*")
          .eq("id", answer.project_id)
          .single();

        if (!project) {
          results.push({ id: answer.id, type: "answer", success: false, error: "Project not found" });
          continue;
        }

        // Get integration
        const { data: integrations } = await supabase
          .from("integrations")
          .select("*")
          .eq("project_id", answer.project_id)
          .eq("is_connected", true)
          .limit(1);

        if (!integrations || integrations.length === 0) {
          // Just mark as public without CMS publishing
          await supabase
            .from("answers")
            .update({ is_public: true, published_at: new Date().toISOString() })
            .eq("id", answer.id);
          
          console.log(`[publish-scheduled] ✅ Answer marked as public (no CMS): ${answer.id}`);
          results.push({ id: answer.id, type: "answer", success: true, url: "internal" });
          continue;
        }

        const integration = integrations[0] as Integration;
        const { title, body, excerpt } = generateAnswerHTML(answer, project);

        // Call cms-publish
        const publishResponse = await fetch(`${supabaseUrl}/functions/v1/cms-publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            integrationId: integration.id,
            content: { title, body, excerpt, type: "answer", sourceId: answer.id }
          })
        });

        const publishResult = await publishResponse.json();

        if (publishResult.success) {
          await supabase
            .from("answers")
            .update({
              is_public: true,
              published_url: publishResult.publishedUrl || null,
              published_at: new Date().toISOString()
            })
            .eq("id", answer.id);

          console.log(`[publish-scheduled] ✅ Answer published: ${publishResult.publishedUrl || answer.id}`);
          results.push({ id: answer.id, type: "answer", success: true, url: publishResult.publishedUrl });
        } else {
          console.error(`[publish-scheduled] ❌ Failed to publish answer: ${publishResult.error}`);
          results.push({ id: answer.id, type: "answer", success: false, error: publishResult.error });
        }
      } catch (err) {
        console.error(`[publish-scheduled] ❌ Error processing answer ${answer.id}:`, err);
        results.push({ id: answer.id, type: "answer", success: false, error: String(err) });
      }
    }

    // Process articles (emerald items)
    for (const article of articles || []) {
      try {
        console.log(`[publish-scheduled] 💚 Processing article: ${article.title.substring(0, 50)}...`);
        
        // Get project info
        const { data: project } = await supabase
          .from("projects")
          .select("*")
          .eq("id", article.project_id)
          .single();

        if (!project) {
          results.push({ id: article.id, type: "article", success: false, error: "Project not found" });
          continue;
        }

        // Get integration
        const { data: integrations } = await supabase
          .from("integrations")
          .select("*")
          .eq("project_id", article.project_id)
          .eq("is_connected", true)
          .limit(1);

        if (!integrations || integrations.length === 0) {
          // Just mark as published without CMS
          const fallbackUrl = buildPublicBlogUrl(project.website_url, article.slug);
          await supabase
            .from("articles")
            .update({ status: "published" })
            .eq("id", article.id);
          if (article.linked_answer_id) {
            await supabase
              .from("answers")
              .update({ is_public: true, published_url: fallbackUrl, published_at: new Date().toISOString() })
              .eq("id", article.linked_answer_id);
          }
          
          console.log(`[publish-scheduled] ✅ Article marked as published (no CMS): ${fallbackUrl || article.id}`);
          results.push({ id: article.id, type: "article", success: true, url: fallbackUrl || "internal" });
          continue;
        }

        const integration = integrations[0] as Integration;
        const { title, body, excerpt } = generateArticleHTML(article, project);

        // Call cms-publish with slug included
        const articleSlug = (article as any).slug || article.title
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 80);

        const publishResponse = await fetch(`${supabaseUrl}/functions/v1/cms-publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            integrationId: integration.id,
            content: { title, body, excerpt, type: "article", sourceId: article.id, slug: articleSlug }
          })
        });

        const publishResult = await publishResponse.json();

        if (publishResult.success) {
          const publishedUrl = publishResult.publishedUrl || buildPublicBlogUrl(project.website_url, articleSlug);
          await supabase
            .from("articles")
            .update({ status: "published" })
            .eq("id", article.id);
          if (article.linked_answer_id) {
            await supabase
              .from("answers")
              .update({
                is_public: true,
                published_url: publishedUrl || null,
                published_at: new Date().toISOString()
              })
              .eq("id", article.linked_answer_id);
          }

          console.log(`[publish-scheduled] ✅ Article published: ${publishedUrl || article.id}`);
          results.push({ id: article.id, type: "article", success: true, url: publishedUrl || undefined });
        } else {
          console.error(`[publish-scheduled] ❌ Failed to publish article: ${publishResult.error}`);
          results.push({ id: article.id, type: "article", success: false, error: publishResult.error });
        }
      } catch (err) {
        console.error(`[publish-scheduled] ❌ Error processing article ${article.id}:`, err);
        results.push({ id: article.id, type: "article", success: false, error: String(err) });
      }
    }

    // Process local answers (orange items)
    for (const localAnswer of localAnswers || []) {
      try {
        console.log(`[publish-scheduled] 🧡 Processing local answer: ${localAnswer.question.substring(0, 50)}...`);
        
        // Get project info
        const { data: project } = await supabase
          .from("projects")
          .select("*")
          .eq("id", localAnswer.project_id)
          .single();

        if (!project) {
          results.push({ id: localAnswer.id, type: "local-answer", success: false, error: "Project not found" });
          continue;
        }

        // Get integration
        const { data: integrations } = await supabase
          .from("integrations")
          .select("*")
          .eq("project_id", localAnswer.project_id)
          .eq("is_connected", true)
          .limit(1);

        if (!integrations || integrations.length === 0) {
          // Just mark as public without CMS publishing
          await supabase
            .from("local_answers")
            .update({ is_public: true, published_at: new Date().toISOString() })
            .eq("id", localAnswer.id);
          
          console.log(`[publish-scheduled] ✅ Local answer marked as public (no CMS): ${localAnswer.id}`);
          results.push({ id: localAnswer.id, type: "local-answer", success: true, url: "internal" });
          continue;
        }

        const integration = integrations[0] as Integration;
        const { title, body, excerpt } = generateLocalAnswerHTML(localAnswer as LocalAnswer, project);

        // Call cms-publish
        const publishResponse = await fetch(`${supabaseUrl}/functions/v1/cms-publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            integrationId: integration.id,
            content: { title, body, excerpt, type: "local-answer", sourceId: localAnswer.id }
          })
        });

        const publishResult = await publishResponse.json();

        if (publishResult.success) {
          await supabase
            .from("local_answers")
            .update({
              is_public: true,
              published_url: publishResult.publishedUrl || null,
              published_at: new Date().toISOString()
            })
            .eq("id", localAnswer.id);

          console.log(`[publish-scheduled] ✅ Local answer published: ${publishResult.publishedUrl || localAnswer.id}`);
          results.push({ id: localAnswer.id, type: "local-answer", success: true, url: publishResult.publishedUrl });
        } else {
          console.error(`[publish-scheduled] ❌ Failed to publish local answer: ${publishResult.error}`);
          results.push({ id: localAnswer.id, type: "local-answer", success: false, error: publishResult.error });
        }
      } catch (err) {
        console.error(`[publish-scheduled] ❌ Error processing local answer ${localAnswer.id}:`, err);
        results.push({ id: localAnswer.id, type: "local-answer", success: false, error: String(err) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const answerCount = results.filter(r => r.type === "answer" && r.success).length;
    const articleCount = results.filter(r => r.type === "article" && r.success).length;
    const localAnswerCount = results.filter(r => r.type === "local-answer" && r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log(`[publish-scheduled] 🎉 COMPLETED: ${answerCount} answers (💜), ${articleCount} articles (💚), ${localAnswerCount} local answers (🧡) published`);
    if (failedCount > 0) {
      console.log(`[publish-scheduled] ⚠️ ${failedCount} items failed to publish`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Published ${answerCount} answers, ${articleCount} articles, and ${localAnswerCount} local answers`,
        published: successCount,
        failed: failedCount,
        answers: answerCount,
        articles: articleCount,
        localAnswers: localAnswerCount,
        currentUtcHour,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[publish-scheduled] ❌ Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
