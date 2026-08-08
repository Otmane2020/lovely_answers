"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PublishAnswerParams {
  answerId: string;
  projectId: string;
}

export function usePublishAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ answerId, projectId }: PublishAnswerParams) => {
      // Get ALL active integrations for project (publish to all connected CMS)
      const { data: integrations, error: intError } = await supabase
        .from("integrations")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_connected", true);

      if (intError) throw intError;
      if (!integrations || integrations.length === 0) {
        throw new Error("No CMS integration connected. Please configure an integration first.");
      }

      // Get answer data
      const { data: answer, error: answerError } = await supabase
        .from("answers")
        .select("*")
        .eq("id", answerId)
        .single();

      if (answerError) throw answerError;

      // Get generation settings for brand info
      const { data: settings } = await supabase
        .from("generation_settings")
        .select("brand_name, website_url, language")
        .eq("project_id", projectId)
        .single();

      // Get project language as fallback
      const { data: project } = await supabase
        .from("projects")
        .select("language, brand_name, website_url")
        .eq("id", projectId)
        .single();

      // Use settings first, then project fallback
      const brandName = settings?.brand_name || project?.brand_name || "Brand";
      const websiteUrl = settings?.website_url || project?.website_url || "";
      const language = settings?.language || project?.language || "fr";

      // Generate article HTML
      const articleHTML = generateArticleHTML(answer, { brandName, websiteUrl, language });

      // Publish to ALL connected integrations
      const results: { platform: string; success: boolean; url?: string; error?: string }[] = [];
      
      for (const integration of integrations) {
        try {
          const { data, error } = await supabase.functions.invoke("cms-publish", {
            body: {
              integrationId: integration.id,
              content: {
                title: answer.question,
                body: articleHTML,
                type: "answer",
                sourceId: answerId
              }
            }
          });

          if (error) {
            results.push({ platform: integration.platform, success: false, error: error.message });
          } else if (!data.success) {
            results.push({ platform: integration.platform, success: false, error: data.message || "Publication failed" });
          } else {
            results.push({ platform: integration.platform, success: true, url: data.publishedUrl });
          }
        } catch (err) {
          results.push({ platform: integration.platform, success: false, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      // Check if at least one succeeded
      const successfulPublishes = results.filter(r => r.success);
      const failedPublishes = results.filter(r => !r.success);
      
      if (successfulPublishes.length === 0) {
        throw new Error(`All publications failed: ${failedPublishes.map(f => `${f.platform}: ${f.error}`).join(", ")}`);
      }

      // Update answer as published with first successful URL
      const firstSuccessUrl = successfulPublishes[0]?.url;
      await supabase
        .from("answers")
        .update({
          is_public: true,
          published_url: firstSuccessUrl || null,
          published_at: new Date().toISOString()
        })
        .eq("id", answerId);

      return { 
        results, 
        successCount: successfulPublishes.length, 
        failCount: failedPublishes.length,
        publishedUrl: firstSuccessUrl || null
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["answers"] });
      if (data.failCount > 0) {
        toast.success(`Published to ${data.successCount} CMS`, {
          description: `${data.failCount} failed - check integrations settings`
        });
      } else {
        toast.success(`Published to ${data.successCount} CMS successfully!`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });
}

function generateArticleHTML(
  answer: any,
  settings: { brandName: string; websiteUrl: string; language: string }
): string {
  const { question, answer: answerText, supporting_content } = answer;
  const { brandName, websiteUrl, language } = settings;
  const currentYear = new Date().getFullYear();

  // Safely extract bullets - handle different structures
  const rawBullets = (supporting_content as any)?.bullets || [];
  const bullets = rawBullets.filter((b: any) => b && typeof b === 'string' && b.trim());

  // Safely extract FAQ - filter out empty/invalid items
  const rawFaq = (supporting_content as any)?.faq || [];
  const faq = rawFaq.filter((item: any) => 
    item && 
    typeof item === 'object' && 
    item.question && 
    item.answer && 
    item.question.trim() && 
    item.answer.trim()
  );

  // Build proper author object
  const authorObj = websiteUrl && brandName && brandName !== 'Brand' 
    ? { "@type": "Organization", "name": brandName, "url": websiteUrl }
    : brandName && brandName !== 'Brand'
    ? { "@type": "Organization", "name": brandName }
    : null;

  const qaJsonLd = {
    "@context": "https://schema.org",
    "@type": "QAPage",
    "mainEntity": {
      "@type": "Question",
      "name": question,
      "dateCreated": new Date().toISOString(),
      "acceptedAnswer": {
        "@type": "Answer",
        "text": answerText,
        "dateCreated": new Date().toISOString(),
        ...(authorObj && { author: authorObj })
      }
    }
  };

  // Only create FAQ JSON-LD if we have valid FAQ items
  const faqJsonLd = faq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map((item: any) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": { "@type": "Answer", "text": item.answer }
    }))
  } : null;

  // Inline CSS for consistent styling across CMS platforms
  const inlineStyles = `
    <style>
      .aeo-article { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.7; color: #1a1a1a; }
      .aeo-article h1 { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; line-height: 1.3; }
      .aeo-answer-box { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-left: 4px solid #3b82f6; padding: 1.5rem; margin: 1.5rem 0; border-radius: 0 8px 8px 0; }
      .aeo-answer-box p { margin: 0; font-size: 1.1rem; }
      .aeo-key-points { background: #fefce8; border: 1px solid #fef08a; padding: 1.5rem; margin: 2rem 0; border-radius: 8px; }
      .aeo-key-points h2 { font-size: 1.25rem; margin: 0 0 1rem 0; color: #854d0e; }
      .aeo-key-points ul { margin: 0; padding-left: 1.25rem; }
      .aeo-key-points li { margin-bottom: 0.5rem; color: #713f12; }
      .aeo-faq { margin: 2rem 0; }
      .aeo-faq h2 { font-size: 1.25rem; margin-bottom: 1rem; }
      .aeo-faq details { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 0.75rem; overflow: hidden; }
      .aeo-faq summary { padding: 1rem; background: #f9fafb; cursor: pointer; font-weight: 500; }
      .aeo-faq summary:hover { background: #f3f4f6; }
      .aeo-faq details[open] summary { border-bottom: 1px solid #e5e7eb; }
      .aeo-faq details p { padding: 1rem; margin: 0; background: white; }
      .aeo-footer { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e5e7eb; font-size: 0.875rem; color: #6b7280; }
      .aeo-footer a { color: #3b82f6; text-decoration: none; }
      .aeo-footer a:hover { text-decoration: underline; }
      .aeo-meta { display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.8rem; color: #9ca3af; }
    </style>
  `;

  const keyPointsTitle = language === 'fr' ? 'Points Clés' : 'Key Points';
  const faqTitle = language === 'fr' ? 'Questions Fréquentes' : 'Frequently Asked Questions';
  const sourceLabel = language === 'fr' ? 'Source' : 'Source';
  const lastUpdatedLabel = language === 'fr' ? 'Mis à jour' : 'Last updated';

  const bulletsList = bullets.length > 0 
    ? `<section class="aeo-key-points">
        <h2>${keyPointsTitle}</h2>
        <ul>${bullets.map((b: string) => `<li>${b}</li>`).join('')}</ul>
      </section>` 
    : '';

  const faqSection = faq.length > 0 
    ? `<section class="aeo-faq">
        <h2>${faqTitle}</h2>
        ${faq.map((item: any) => `
          <details>
            <summary>${item.question}</summary>
            <p>${item.answer}</p>
          </details>
        `).join('')}
      </section>` 
    : '';

  // Build footer with AutoPilot Geo branding
  const brandUrl = "https://autopilotgeo.com";
  const brandTagline = "Rank in ChatGPT Gemini & Google with AI Answers";
  const brandShort = "Rank in ChatGPT";
  
  const footer = `<footer class="aeo-footer">
    <p><a href="${brandUrl}" rel="author" target="_blank">AutoPilot Geo</a> – ${brandTagline}</p>
    <div class="aeo-meta">
      <span>AutoPilot Geo – ${brandShort}</span>
    </div>
  </footer>`;

  return `
<article class="aeo-article" itemscope itemtype="https://schema.org/Article">
  ${inlineStyles}
  <script type="application/ld+json">${JSON.stringify(qaJsonLd)}</script>
  ${faqJsonLd ? `<script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>` : ''}
  
  <h1 itemprop="headline">${question}</h1>
  
  <div class="aeo-answer-box" itemprop="articleBody">
    <p>${answerText}</p>
  </div>
  
  ${bulletsList}
  ${faqSection}
  ${footer}
</article>`;
}
