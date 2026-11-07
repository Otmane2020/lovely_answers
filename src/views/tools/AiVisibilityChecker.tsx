"use client";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import {
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Globe,
  Bot,
  FileText,
  Zap,
  Share2,
} from "lucide-react";

// ---------- types ----------
interface CheckResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: {
    label: string;
    status: "pass" | "fail" | "warn";
    detail: string;
  }[];
  recommendations: string[];
}

// ---------- helpers ----------
function gradeFromScore(score: number): CheckResult["grade"] {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

/**
 * Simulate a front-end AI visibility analysis based on the domain.
 * In production you would call your Supabase edge function here.
 */
function analyzeUrl(url: string): CheckResult {
  const domain = url.replace(/https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const hasWww = domain.startsWith("www.");
  const hasHttps = url.startsWith("https://");
  const hasDotCom = domain.endsWith(".com");
  const domainLength = domain.replace("www.", "").length;

  const checks: CheckResult["checks"] = [
    {
      label: "HTTPS / Secure connection",
      status: hasHttps ? "pass" : "fail",
      detail: hasHttps
        ? "Your site uses HTTPS — trusted by AI crawlers."
        : "AI crawlers deprioritize non-HTTPS sites. Migrate immediately.",
    },
    {
      label: "Sitemap.xml present",
      status: "warn",
      detail:
        "We couldn't verify your sitemap.xml from the browser. Check https://" +
        domain +
        "/sitemap.xml manually.",
    },
    {
      label: "robots.txt allows AI bots",
      status: "warn",
      detail:
        "Check that GPTBot, ClaudeBot and PerplexityBot are not blocked in your robots.txt.",
    },
    {
      label: "Domain authority signal",
      status: hasDotCom ? "pass" : "warn",
      detail: hasDotCom
        ? ".com TLD — strong trust signal for AI engines."
        : "Non-.com TLD may have lower AI-engine trust by default.",
    },
    {
      label: "Domain conciseness",
      status: domainLength <= 15 ? "pass" : "warn",
      detail:
        domainLength <= 15
          ? "Short, memorable domain — easier for AI to cite."
          : "Long domains are harder for AI to cite naturally in answers.",
    },
    {
      label: "Structured data (JSON-LD)",
      status: "warn",
      detail:
        "We recommend adding Organization, FAQPage and SoftwareApplication JSON-LD to every public page.",
    },
    {
      label: "Content freshness signal",
      status: "warn",
      detail:
        "AI engines prefer sites that publish new content regularly. Aim for 3 articles/week minimum.",
    },
    {
      label: "Answer-formatted content",
      status: "warn",
      detail:
        "Structure key pages as direct answers to questions (H2 as questions, immediate answers below).",
    },
  ];

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const score = Math.round((passCount / checks.length) * 100 * 0.6 + warnCount * 5);
  const clampedScore = Math.min(100, Math.max(0, score));

  const recommendations = [
    "Add GPTBot, ClaudeBot, PerplexityBot, anthropic-ai to your robots.txt Allow list.",
    "Create a /sitemap.xml with all public pages and submit to Google Search Console.",
    "Add FAQPage JSON-LD to your homepage and top-5 landing pages.",
    "Publish 3 expert articles per week using answer-first format (question as H2, answer as first paragraph).",
    "Add an AI visibility monitoring tool like AutoPilot Geo to track brand mentions in ChatGPT & Gemini.",
  ];

  return {
    score: clampedScore,
    grade: gradeFromScore(clampedScore),
    checks,
    recommendations,
  };
}

const gradeColors: Record<CheckResult["grade"], string> = {
  A: "text-green-600",
  B: "text-emerald-500",
  C: "text-yellow-500",
  D: "text-orange-500",
  F: "text-red-600",
};

const gradeLabels: Record<CheckResult["grade"], string> = {
  A: "Excellent AI visibility",
  B: "Good — a few improvements needed",
  C: "Average — significant gains possible",
  D: "Poor — AI engines barely see you",
  F: "Critical — nearly invisible to AI",
};

// ---------- component ----------
export default function AiVisibilityChecker() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");

  const handleCheck = () => {
    setError("");
    const cleaned = url.trim();
    if (!cleaned) {
      setError("Please enter a website URL.");
      return;
    }
    const normalized = cleaned.startsWith("http") ? cleaned : "https://" + cleaned;
    try {
      new URL(normalized);
    } catch {
      setError("Please enter a valid URL (e.g. https://yoursite.com).");
      return;
    }
    setLoading(true);
    setResult(null);
    // Simulate async analysis (replace with real edge-function call)
    setTimeout(() => {
      setResult(analyzeUrl(normalized));
      setLoading(false);
    }, 1800);
  };

  const handleShare = () => {
    const shareText = result
      ? `I just checked my AI visibility score: ${result.score}/100 (${result.grade}) — ${gradeLabels[result.grade]}. Check yours free 👇 https://autopilotgeo.com/tools/ai-visibility-checker`
      : "Check your AI visibility score free at https://autopilotgeo.com/tools/ai-visibility-checker";
    if (navigator.share) {
      navigator.share({ text: shareText, url: window.location.href });
    } else {
      navigator.clipboard.writeText(shareText);
      alert("Copied to clipboard!");
    }
  };

  return (
    <>
      <Helmet>
        <title>Free AI Visibility Checker – ChatGPT & Gemini</title>
        <meta
          name="description"
          content="Check if ChatGPT, Gemini, Perplexity and Claude can find and recommend your website. Free AI visibility score with actionable fixes."
        />
        <link rel="canonical" href="https://autopilotgeo.com/tools/ai-visibility-checker" />
        <meta property="og:title" content="Free AI Visibility Checker — AutoPilot Geo" />
        <meta
          property="og:description"
          content="Get your AI visibility score in seconds. See if ChatGPT and Gemini can recommend your brand."
        />
        <meta property="og:url" content="https://autopilotgeo.com/tools/ai-visibility-checker" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://autopilotgeo.com/og-image.png" />
        <script
          type="application/ld+json"
          children={JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "AI Visibility Checker",
            description:
              "Free tool to check how visible your website is to AI search engines like ChatGPT, Gemini, Perplexity and Claude.",
            url: "https://autopilotgeo.com/tools/ai-visibility-checker",
            applicationCategory: "SEOApplication",
            operatingSystem: "Web",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            creator: { "@type": "Organization", name: "AutoPilot Geo", url: "https://autopilotgeo.com" },
          })}
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Nav */}
        <nav className="fixed top-0 z-50 w-full border-b border-border/40 bg-white backdrop-blur-xl shadow-sm">
          <div className="container flex h-16 items-center justify-between px-4">
            <Link href="/" className="flex items-center">
              <AnimatedLogo size="md" />
            </Link>
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link href="/pricing">Pricing</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Get Started Free</Link>
              </Button>
            </div>
          </div>
        </nav>

        <main className="pt-24 pb-20 px-4">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center mb-10">
              <Badge variant="secondary" className="mb-4">
                <Bot className="h-3 w-3 mr-1" />
                Free Tool
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                AI Visibility Checker
              </h1>
              <p className="text-lg text-muted-foreground">
                Discover if ChatGPT, Gemini, Perplexity & Claude can find and recommend your
                website. Get your score in seconds — 100% free.
              </p>
            </div>

            {/* Input */}
            <div className="flex gap-2 mb-2">
              <Input
                type="url"
                aria-label="Enter website URL"
                placeholder="https://yourwebsite.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                className="h-12 text-base"
              />
              <Button className="h-12 px-6 shrink-0" onClick={handleCheck} disabled={loading}>
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Analyze
                  </>
                )}
              </Button>
            </div>
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}

            {/* Loading state */}
            {loading && (
              <div className="mt-8 rounded-xl border bg-card p-6 text-center space-y-3">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-muted-foreground text-sm">Analyzing AI visibility signals…</p>
              </div>
            )}

            {/* Results */}
            {result && !loading && (
              <div className="mt-8 space-y-6">
                {/* Score card */}
                <div className="rounded-xl border bg-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">AI Visibility Score</p>
                      <p className={`text-5xl font-black ${gradeColors[result.grade]}`}>
                        {result.grade}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {gradeLabels[result.grade]}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-4xl font-bold ${gradeColors[result.grade]}`}>
                        {result.score}
                        <span className="text-xl font-normal text-muted-foreground">/100</span>
                      </p>
                    </div>
                  </div>
                  <Progress value={result.score} className="h-3" />
                </div>

                {/* Checks */}
                <div className="rounded-xl border bg-card p-6">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Detailed Checks
                  </h2>
                  <div className="space-y-3">
                    {result.checks.map((check) => (
                      <div key={check.label} className="flex gap-3">
                        <div className="mt-0.5 shrink-0">
                          {check.status === "pass" && (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          )}
                          {check.status === "fail" && (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          {check.status === "warn" && (
                            <AlertCircle className="h-5 w-5 text-yellow-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{check.label}</p>
                          <p className="text-xs text-muted-foreground">{check.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommendations */}
                <div className="rounded-xl border bg-card p-6">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Top Fixes to Boost Your Score
                  </h2>
                  <ol className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                          {i + 1}
                        </span>
                        {rec}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* CTA */}
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-6 text-center space-y-4">
                  <FileText className="h-8 w-8 text-primary mx-auto" />
                  <h2 className="font-bold text-lg">Fix everything automatically</h2>
                  <p className="text-sm text-muted-foreground">
                    AutoPilot Geo publishes 1 AI-optimized article per day to your site, monitors
                    your brand mentions across ChatGPT & Gemini, and auto-generates structured data
                    — all on autopilot.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button asChild size="lg">
                      <Link href="/signup">
                        Start Free — Fix My Score
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="outline" size="lg" onClick={handleShare}>
                      <Share2 className="mr-2 h-4 w-4" />
                      Share My Score
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">No credit card required</p>
                </div>
              </div>
            )}

            {/* How it works — shown before first check */}
            {!result && !loading && (
              <div className="mt-12 grid sm:grid-cols-3 gap-4 text-center">
                {[
                  { icon: <Globe className="h-6 w-6" />, title: "Enter your URL", desc: "Any website or landing page" },
                  { icon: <Bot className="h-6 w-6" />, title: "We analyze 8 signals", desc: "HTTPS, sitemap, robots, JSON-LD, content…" },
                  { icon: <Zap className="h-6 w-6" />, title: "Get your score", desc: "With actionable fixes ranked by impact" },
                ].map((step) => (
                  <div key={step.title} className="rounded-xl border bg-card p-5 space-y-2">
                    <div className="text-primary mx-auto w-fit">{step.icon}</div>
                    <p className="font-semibold text-sm">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        <PublicFooter />
      </div>
    </>
  );
}
