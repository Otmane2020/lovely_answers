"use client";
import { useMemo } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { PublicFooter } from "@/components/layout/PublicFooter";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Share2,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

interface ArticleTemplateProps {
  title: string;
  htmlContent: string;
  metaDescription?: string | null;
  publishedAt?: string | null;
  slug: string;
  author?: string | null;
}

function estimateReadingTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function extractHeadings(html: string): { id: string; text: string; level: number }[] {
  const regex = /<h([2-3])[^>]*>(.*?)<\/h\1>/gi;
  const headings: { id: string; text: string; level: number }[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]*>/g, "").trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    headings.push({ id, text, level: parseInt(match[1]) });
  }
  return headings;
}

function extractExcerpt(html: string, maxLen = 180): string {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s\S*$/, "") + "…";
}

function injectHeadingIds(html: string): string {
  return html.replace(/<h([2-3])([^>]*)>([\s\S]*?)<\/h\1>/gi, (_, level, attrs, inner) => {
    const text = inner.replace(/<[^>]*>/g, "").trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });
}

/**
 * Normalize article body:
 *  - Strip leading <h1> (rendered separately as the page title)
 *  - Convert Markdown (##, ###, *, -, **bold**, links) to HTML when present
 *  - Auto-close orphaned <h1|h2|h3> tags so the rest of the article isn't
 *    rendered inside a giant heading (the actual bug behind the "tout en gras")
 */
function normalizeContent(raw: string): string {
  if (!raw) return "";
  let html = raw.trim();

  // 0. Strip inline `style=""` and most class attributes
  html = html.replace(/\sstyle\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\sstyle\s*=\s*'[^']*'/gi, "");
  const allowedClasses = new Set(["lead", "key-answer", "key-answer-label", "comparison-table", "checklist", "warning-box", "tip-box", "stats-row", "stat-card", "stat-number", "stat-label", "faq-item", "faq-question", "faq-answer"]);
  html = html.replace(/\sclass\s*=\s*(["'])([^"']*)\1/gi, (_, quote, value) => {
    const kept = String(value).split(/\s+/).filter((cls) => allowedClasses.has(cls));
    return kept.length ? ` class=${quote}${kept.join(" ")}${quote}` : "";
  });

  // 0.b Unwrap outer wrappers
  html = html.replace(/<\/?article[^>]*>/gi, "");
  html = html.replace(/<\/?section[^>]*>/gi, "");

  // 1. Drop H1 (rendered in the hero)
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "").trim();
  html = html.replace(/<h1[^>]*>/gi, "");

  // 1.b CRITICAL: generated articles often produce one giant unstructured paragraph
  // mixing raw <h2>/<h3> openings AND inline markdown (##, ### , *   ).
  // Force these patterns to become block boundaries before further parsing.
  html = html.replace(/\s*<h([23])([^>]*)>/gi, "\n\n<h$1$2>");
  html = html.replace(/([^\n])\s{2,}(#{2,3}\s+)/g, "$1\n\n$2");
  html = html.replace(/([^\n])\s{2,}(\*\s{2,}\*\*)/g, "$1\n\n$2");
  html = html.replace(/([^\n])\s{2,}(\*\s+(?=\S))/g, "$1\n\n* ");

  // 2. Auto-close orphan headings: extract first sentence as heading text,
  //    push the remainder into a paragraph.
  html = html.replace(
    /<h([1-6])([^>]*)>([\s\S]*?)(?=<h[1-6][\s>]|<\/?(?:p|div|ul|ol|section|article|blockquote)[\s>]|$)/gi,
    (full, lvl, attrs, inner) => {
      const closeRe = new RegExp(`</h${lvl}>`, "i");
      if (closeRe.test(inner)) return full;
      const stripped = inner.replace(/<[^>]*>/g, "").trim();
      if (!stripped) return `<h${lvl}${attrs}></h${lvl}>`;
      let headText = "";
      const sentenceMatch = stripped.match(/^(.{5,140}?[.?!:])(?:\s|$)/);
      if (sentenceMatch) {
        headText = sentenceMatch[1].replace(/[.?!:]+$/, "").trim();
      } else {
        const slice = stripped.slice(0, 90);
        headText = slice.replace(/\s\S*$/, "").trim() || slice.trim();
      }
      const restText = stripped.slice(headText.length).replace(/^[.?!:\s]+/, "").trim();
      const restHtml = restText ? `\n\n${restText}` : "";
      return `<h${lvl}${attrs}>${headText}</h${lvl}>${restHtml}`;
    }
  );

  // 2.b Unwrap <p>...</p> that now contain block elements
  html = html.replace(/<p>([\s\S]*?)<\/p>/gi, (m, inner) => {
    if (/<(h[1-6]|ul|ol|li|blockquote|table)\b/i.test(inner)) return inner;
    return m;
  });

  // 3. Markdown → HTML
  const looksMarkdown = /(^|\n)\s*(#{2,3} |[*\-] |\d+\.\s)/.test(html) || /\*\*[^*]+\*\*/.test(html);
  if (looksMarkdown) {
    html = html.replace(/^\s*###\s+(.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^\s*##\s+(.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/(?:^|\n)((?:\s*[*\-]\s+.+\n?)+)/g, (_, block) => {
      const items = block
        .trim()
        .split(/\n/)
        .map((l: string) => l.replace(/^\s*[*\-]\s+/, "").trim())
        .filter(Boolean)
        .map((t: string) => `<li>${t}</li>`)
        .join("");
      return `\n<ul>${items}</ul>\n`;
    });
    html = html
      .split(/\n{2,}/)
      .map((chunk) => {
        const t = chunk.trim();
        if (!t) return "";
        if (/^\s*<(h[1-6]|ul|ol|li|p|blockquote|pre|table|div|section|article|figure|img)/i.test(t)) return t;
        return `<p>${t}</p>`;
      })
      .join("\n");
  }

  // 4. Tidy
  html = html.replace(/<p>\s*(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)\s*<\/p>/gi, "$1");
  html = html.replace(/<p>\s*<\/p>/gi, "");

  return html;
}

export default function ArticleTemplate({
  title,
  htmlContent,
  metaDescription,
  publishedAt,
  slug,
  author,
}: ArticleTemplateProps) {
  const brand = "AutoPilot Geo";
  const brandUrl = "https://autopilotgeo.com";

  const normalizedHtml = useMemo(() => normalizeContent(htmlContent), [htmlContent]);
  const readingTime = useMemo(() => estimateReadingTime(normalizedHtml), [normalizedHtml]);
  const headings = useMemo(() => extractHeadings(normalizedHtml), [normalizedHtml]);
  const excerpt = useMemo(
    () => metaDescription || extractExcerpt(normalizedHtml),
    [metaDescription, normalizedHtml]
  );
  const processedHtml = useMemo(() => sanitizeHtml(injectHeadingIds(normalizedHtml)), [normalizedHtml]);

  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const shareArticle = async () => {
    const url = `${brandUrl}/blog/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied!");
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  };

  const articleStructuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: excerpt,
    datePublished: publishedAt,
    dateModified: publishedAt,
    url: `${brandUrl}/blog/${slug}`,
    mainEntityOfPage: `${brandUrl}/blog/${slug}`,
    publisher: {
      "@type": "Organization",
      name: brand,
      url: brandUrl,
      logo: { "@type": "ImageObject", url: `${brandUrl}/favicon.png` },
    },
    author: {
      "@type": "Organization",
      name: author || brand,
      url: brandUrl,
    },
  };

  const breadcrumbStructuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: brandUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${brandUrl}/blog` },
      { "@type": "ListItem", position: 3, name: title, item: `${brandUrl}/blog/${slug}` },
    ],
  };

  // Extract FAQ items from body markup using `faq-item` / `faq-question` / `faq-answer` classes
  const faqStructuredData = useMemo(() => {
    const items: { q: string; a: string }[] = [];
    const re = /<div[^>]*class="[^"]*faq-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*faq-item|<h2|<\/article|$)/gi;
    let m;
    while ((m = re.exec(normalizedHtml)) !== null) {
      const block = m[1];
      const qMatch = block.match(/<div[^>]*class="[^"]*faq-question[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const aMatch = block.match(/<div[^>]*class="[^"]*faq-answer[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (qMatch && aMatch) {
        items.push({
          q: qMatch[1].replace(/<[^>]*>/g, "").trim(),
          a: aMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
        });
      }
    }
    if (!items.length) return null;
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map((i) => ({
        "@type": "Question",
        name: i.q,
        acceptedAnswer: { "@type": "Answer", text: i.a },
      })),
    };
  }, [normalizedHtml]);

  return (
    <>
      <Helmet>
        <title>{title} | {brand}</title>
        <meta name="description" content={excerpt} />
        <meta property="og:site_name" content={brand} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={excerpt} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`${brandUrl}/blog/${slug}`} />
        <meta property="og:image" content={`${brandUrl}/favicon.png`} />
        {publishedAt && <meta property="article:published_time" content={publishedAt} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={excerpt} />
        <meta name="twitter:image" content={`${brandUrl}/favicon.png`} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${brandUrl}/blog/${slug}`} />
        <script type="application/ld+json">{JSON.stringify(articleStructuredData)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbStructuredData)}</script>
        {faqStructuredData && (
          <script type="application/ld+json">{JSON.stringify(faqStructuredData)}</script>
        )}
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* ─── Topbar ─── */}
        <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 flex h-14 items-center justify-between">
            <Link href="/" className="flex items-center">
              <AnimatedLogo size="sm" />
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/blog">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                  <ArrowLeft className="h-4 w-4" /> Blog
                </Button>
              </Link>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={shareArticle}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* ─── Hero ─── */}
        <section className="editorial-hero">
          <div className="max-w-3xl mx-auto px-4 pt-16 pb-10 md:pt-24 md:pb-14 text-center">
            <Badge variant="secondary" className="mb-5 text-xs tracking-widest uppercase font-medium">
              <BookOpen className="h-3 w-3 mr-1.5" />
              Editorial
            </Badge>

            <h1 className="editorial-title">{title}</h1>

            <p className="editorial-subtitle">{excerpt}</p>

            {/* Byline */}
            <div className="editorial-byline">
              <div className="editorial-byline-avatar">
                <span className="text-primary-foreground font-bold text-xs">AG</span>
              </div>
              <div className="flex flex-col items-start text-sm">
                <span className="font-semibold text-foreground">{author || brand}</span>
                <div className="flex items-center gap-3 text-muted-foreground text-xs">
                  {formattedDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formattedDate}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {readingTime} min read
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="editorial-hero-rule" />
        </section>

        {/* ─── Body ─── */}
        <div className="max-w-5xl mx-auto px-4 py-10 md:py-14 flex gap-10">
          {/* Sidebar TOC (desktop) */}
          {headings.length > 2 && (
            <aside className="hidden lg:block w-56 shrink-0 sticky top-20 self-start">
              <nav className="editorial-toc">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Table of Contents
                </h4>
                <ul className="space-y-2">
                  {headings.map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        className={`block text-sm leading-snug text-muted-foreground hover:text-foreground transition-colors ${
                          h.level === 3 ? "pl-3 border-l border-border" : "font-medium"
                        }`}
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
          )}

          {/* Article content */}
          <article
            className="editorial-prose flex-1 min-w-0"
            dangerouslySetInnerHTML={{ __html: processedHtml }}
          />
        </div>

        {/* ─── CTA ─── */}
        <section className="border-t border-border bg-muted/30">
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              Want AI-Optimized Content Like This?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              AutoPilot Geo helps you rank first in ChatGPT, Gemini, and Google with automatically
              generated, SEO-optimized articles.
            </p>
            <a href={`${brandUrl}/auth?mode=signup`}>
              <Button size="lg" className="gap-2 gradient-bg text-primary-foreground hover:opacity-90">
                Get Started Free
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </section>

        <PublicFooter />
      </div>
    </>
  );
}
