import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, email } = await req.json();

    // Input validation
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!url || typeof url !== "string" || url.length > 2048) {
      return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!email || typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[send-audit-email] Starting audit for ${url}, sending to ${email}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Step 1: Run the audit (call free-audit logic inline to avoid function-to-function calls)
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY")!;

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http")) {
      cleanUrl = `https://${cleanUrl}`;
    }

    let domain: string;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanUrl);
      domain = parsedUrl.hostname.replace("www.", "");
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SSRF guard: only allow http/https public hostnames; block private/loopback/metadata
    if (!/^https?:$/.test(parsedUrl.protocol)) {
      return new Response(JSON.stringify({ error: "Only http(s) URLs are allowed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const host = parsedUrl.hostname.toLowerCase();
    const blockedHostPatterns = [
      /^localhost$/i, /\.localhost$/i, /^127\./, /^10\./, /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[0-1])\./, /^169\.254\./, /^0\./, /^::1$/, /^fc/, /^fd/,
      /^metadata\.google\.internal$/i,
    ];
    if (blockedHostPatterns.some((re) => re.test(host)) || host === "169.254.169.254") {
      return new Response(JSON.stringify({ error: "Private/internal hosts are not allowed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[send-audit-email] Scraping ${cleanUrl}...`);

    // Scrape website
    let pageContent = "";
    let pageTitle = "";
    let metaDescription = "";

    if (firecrawlApiKey) {
      try {
        const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: cleanUrl,
            formats: ["markdown", "html"],
            onlyMainContent: false,
          }),
        });

        if (scrapeResponse.ok) {
          const scrapeData = await scrapeResponse.json();
          pageContent = scrapeData.data?.markdown || "";
          pageTitle = scrapeData.data?.metadata?.title || "";
          metaDescription = scrapeData.data?.metadata?.description || "";
          console.log(`[send-audit-email] Scraped ${pageContent.length} chars`);
        }
      } catch (scrapeError) {
        console.error("[send-audit-email] Firecrawl error:", scrapeError);
      }
    }

    // Fallback: direct fetch
    if (!pageContent) {
      try {
        const response = await fetch(cleanUrl, {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
        });
        if (response.ok) {
          const htmlContent = await response.text();
          const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
          pageTitle = titleMatch?.[1]?.trim() || "";
          const descMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
          metaDescription = descMatch?.[1]?.trim() || "";
          const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          if (bodyMatch) {
            pageContent = bodyMatch[1]
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .substring(0, 5000);
          }
        }
      } catch (e) {
        console.error("[send-audit-email] Direct fetch error:", e);
      }
    }

    // AI audit analysis
    console.log("[send-audit-email] Running AI audit...");
    const auditPrompt = `You are an expert SEO and AEO (Answer Engine Optimization) auditor. Analyze this website comprehensively.

URL: ${cleanUrl}
Domain: ${domain}
Page Title: ${pageTitle || "Not found"}
Meta Description: ${metaDescription || "Not found"}
Content Length: ${pageContent.length} characters

Page Content (first 4000 chars):
${pageContent.substring(0, 4000)}

Perform a COMPREHENSIVE audit with exactly 15 checks across these categories:

**SEO Checks (8-9 checks):**
1. Title Tag - Is it present, optimal length (30-60 chars), contains keywords?
2. Meta Description - Present, compelling, optimal length (120-160 chars)?
3. H1 Tag - Single H1 present, keyword-optimized?
4. Heading Hierarchy - Proper H1>H2>H3 structure?
5. Content Depth - Enough content (min 300+ words)? Quality assessment
6. Internal Links - Are there internal links for navigation?
7. Schema Markup / Structured Data - JSON-LD present?
8. Mobile & Speed - Viewport meta, responsive indicators?
9. Image Optimization - Alt tags, lazy loading?

**AEO Checks (6-7 checks):**
10. AI-Citable Content - Content structured with clear Q&A or definitions AI can quote?
11. FAQ Schema - FAQ structured data present?
12. Entity Authority - Clear brand/entity information, About page, contact info?
13. Content Freshness - Recent publication dates, blog/news section?
14. llms.txt / AI Crawlability - Indicators that AI bots can access content?
15. Topical Authority - Deep coverage of core topics, supporting articles?

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "category": "Title Tag",
    "status": "pass",
    "title": "Title tag is well optimized",
    "description": "The title is 52 characters and includes main keyword",
    "impact": "high",
    "recommendation": "Consider adding brand name at the end"
  }
]

Rules:
- status must be "pass", "warning", or "fail"
- impact must be "high", "medium", or "low"
- Be specific with actual findings
- Include actionable recommendations for warnings and fails
- Return exactly 15 checks`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://autopilotgeo.com",
        "X-Title": "AutoPilot Geo Audit",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          { role: "system", content: "You are an SEO & AEO expert auditor. Always respond with valid JSON arrays only." },
          { role: "user", content: auditPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const auditContent = aiData.choices?.[0]?.message?.content;

    let auditResults: any[] = [];
    try {
      const jsonMatch = auditContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                        auditContent.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, auditContent];
      auditResults = JSON.parse((jsonMatch[1] || auditContent).trim());
    } catch {
      auditResults = [
        { category: "Technical", status: "warning", title: "Audit partially completed", description: "Some checks could not be processed.", impact: "medium" },
      ];
    }

    // Calculate scores
    const totalChecks = auditResults.length;
    const passCount = auditResults.filter((r: any) => r.status === "pass").length;
    const warningCount = auditResults.filter((r: any) => r.status === "warning").length;
    const failCount = auditResults.filter((r: any) => r.status === "fail").length;
    const overallScore = Math.round((passCount * 100 + warningCount * 50) / Math.max(totalChecks, 1));

    const aeoCategories = ["AI-Citable Content", "FAQ Schema", "Entity Authority", "Content Freshness", "llms.txt", "AI Crawlability", "Topical Authority", "AEO"];
    const seoResults = auditResults.filter((r: any) => !aeoCategories.some(c => r.category.toLowerCase().includes(c.toLowerCase())));
    const aeoResultsFiltered = auditResults.filter((r: any) => aeoCategories.some(c => r.category.toLowerCase().includes(c.toLowerCase())));

    const seoScore = seoResults.length > 0
      ? Math.round(seoResults.reduce((acc: number, r: any) => acc + (r.status === "pass" ? 100 : r.status === "warning" ? 50 : 0), 0) / seoResults.length)
      : 50;

    const aeoScore = aeoResultsFiltered.length > 0
      ? Math.round(aeoResultsFiltered.reduce((acc: number, r: any) => acc + (r.status === "pass" ? 100 : r.status === "warning" ? 50 : 0), 0) / aeoResultsFiltered.length)
      : 30;

    const scores = { overall: overallScore, seo: seoScore, aeo: aeoScore };
    const summary = { total: totalChecks, passed: passCount, warnings: warningCount, failed: failCount };

    console.log(`[send-audit-email] Scores: Overall=${overallScore}, SEO=${seoScore}, AEO=${aeoScore}`);

    // Step 2: Save to site_audits table
    const { data: savedAudit, error: saveError } = await supabaseAdmin
      .from("site_audits")
      .insert({
        url: cleanUrl,
        domain,
        page_title: pageTitle,
        email,
        scores,
        summary,
        results: auditResults,
      })
      .select("id")
      .single();

    if (saveError) {
      console.error("[send-audit-email] Save error:", saveError);
      throw new Error("Failed to save audit");
    }

    const auditId = savedAudit.id;
    console.log(`[send-audit-email] Audit saved with ID: ${auditId}`);

    // Step 3: Send email via Resend
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const auditUrl = `https://autopilotgeo.com/audit?id=${auditId}`;

    // Build top 3 critical issues for email
    const criticalIssues = auditResults
      .filter((r: any) => r.status === "fail" || r.status === "warning")
      .sort((a: any, b: any) => {
        const priority: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const statusPriority: Record<string, number> = { fail: 2, warning: 1, pass: 0 };
        return (statusPriority[b.status] + priority[b.impact]) - (statusPriority[a.status] + priority[a.impact]);
      })
      .slice(0, 3);

    const issuesHtml = criticalIssues.map((issue: any) => {
      const icon = issue.status === "fail" ? "🔴" : "🟡";
      return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
            <div style="font-size: 14px; font-weight: 600; color: #1a1a1a;">${icon} ${issue.title}</div>
            <div style="font-size: 13px; color: #666; margin-top: 4px;">${issue.description}</div>
            ${issue.recommendation ? `<div style="font-size: 12px; color: #7c3aed; margin-top: 4px;">💡 ${issue.recommendation}</div>` : ""}
          </td>
        </tr>`;
    }).join("");

    const scoreColor = (s: number) => s >= 70 ? "#10b981" : s >= 40 ? "#f59e0b" : "#ef4444";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
    
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin: 0;">
        🔍 Your SEO & AEO Audit Report
      </h1>
      <p style="font-size: 14px; color: #666; margin-top: 8px;">${domain}</p>
    </div>

    <!-- Score Cards -->
    <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <table width="100%" cellpadding="0" cellspacing="0" style="text-align: center;">
        <tr>
          <td width="33%">
            <div style="font-size: 36px; font-weight: 800; color: ${scoreColor(overallScore)};">${overallScore}</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Overall</div>
          </td>
          <td width="33%">
            <div style="font-size: 36px; font-weight: 800; color: ${scoreColor(seoScore)};">${seoScore}</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px;">SEO</div>
          </td>
          <td width="33%">
            <div style="font-size: 36px; font-weight: 800; color: ${scoreColor(aeoScore)};">${aeoScore}</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px;">AEO</div>
          </td>
        </tr>
      </table>
      <div style="text-align: center; margin-top: 16px; font-size: 13px; color: #666;">
        ✅ ${passCount} passed &nbsp;&nbsp; ⚠️ ${warningCount} warnings &nbsp;&nbsp; ❌ ${failCount} failed
      </div>
    </div>

    <!-- Top Issues -->
    ${criticalIssues.length > 0 ? `
    <div style="background: white; border-radius: 16px; padding: 20px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <h2 style="font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
        🚨 Top Issues to Fix
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${issuesHtml}
      </table>
    </div>
    ` : ""}

    <!-- CTA Button -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="${auditUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
        📊 View Full Audit Report
      </a>
    </div>

    <!-- Premium Audit CTA -->
    <div style="background: #f8f5ff; border: 2px solid #7c3aed; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <h3 style="font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 0 0 8px;">
        🏆 Want to see how you compare to competitors?
      </h3>
      <p style="font-size: 14px; color: #666; margin: 0 0 16px;">
        Get a Premium AEO Audit with competitor landscape, market trends, and strategic recommendations — completely free.
      </p>
      <a href="https://autopilotgeo.com/audit-premium?url=${encodeURIComponent(cleanUrl)}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        🔍 Get Premium Audit (Free) →
      </a>
    </div>

    <!-- Fix CTA -->
    <div style="background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <h3 style="font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 0 0 8px;">
        🚀 Fix these issues automatically
      </h3>
      <p style="font-size: 14px; color: #666; margin: 0 0 16px;">
        AutoPilot Geo publishes 30 SEO articles/month and optimizes your site for AI search — on autopilot.
      </p>
      <a href="https://autopilotgeo.com/onboarding" style="display: inline-block; padding: 12px 28px; background: #1a1a1a; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        Start Free Trial →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #999;">
        AutoPilot Geo — AI-Powered SEO & AEO Platform<br>
        <a href="https://autopilotgeo.com" style="color: #7c3aed;">autopilotgeo.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    const { data: sendData, error: emailError } = await resend.emails.send({
      from: "AutoPilot Geo <support@autopilotgeo.com>",
      to: [email],
      subject: `🔍 Your SEO & AEO Audit: ${domain} scored ${overallScore}/100`,
      html: emailHtml,
    });
    console.log("[send-audit-email] Resend response:", JSON.stringify({ sendData, emailError }));

    if (emailError) {
      console.error("[send-audit-email] Resend error:", emailError);
      // Still return success since audit was saved
    } else {
      console.log("[send-audit-email] Email sent successfully!");
      // Mark email as sent
      await supabaseAdmin
        .from("site_audits")
        .update({ email_sent: true, email_sent_at: new Date().toISOString() })
        .eq("id", auditId);
    }

    return new Response(
      JSON.stringify({ success: true, auditId, scores, summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-audit-email] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
