"use client";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { GlassCard } from "@/components/ui/glass-card";
import {
  BarChart3,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Target,
  PieChart,
  Zap,
  Eye,
  MessageSquare,
  Share2,
  DollarSign,
  Activity,
  BrainCircuit,
  Search,
  Sparkles,
} from "lucide-react";

const metrics = [
  {
    icon: <Eye className="h-6 w-6" />,
    title: "AI Citation Share",
    description:
      "The percentage of AI-generated responses across ChatGPT, Gemini, Perplexity, and Claude that mention or cite your brand. This is the GEO equivalent of SERP share of voice.",
  },
  {
    icon: <MessageSquare className="h-6 w-6" />,
    title: "Brand Sentiment in LLM Responses",
    description:
      "Analyze whether AI assistants describe your brand positively, neutrally, or negatively when answering queries in your industry. Sentiment directly influences conversion probability.",
  },
  {
    icon: <Share2 className="h-6 w-6" />,
    title: "Answer Attribution Rate",
    description:
      "How often your content is directly referenced as the source in AI answers. Unlike traditional backlinks, this measures semantic citation within generated responses.",
  },
  {
    icon: <DollarSign className="h-6 w-6" />,
    title: "Conversion Attribution from Generative Search",
    description:
      "Track clicks, sign-ups, and revenue from users who first discovered your brand through an AI assistant recommendation rather than a traditional search result.",
  },
  {
    icon: <Activity className="h-6 w-6" />,
    title: "Generative Visibility Index (GVI)",
    description:
      "A composite score measuring your overall presence across major AI platforms. Similar to domain authority, but for the generative search ecosystem.",
  },
  {
    icon: <BrainCircuit className="h-6 w-6" />,
    title: "Query Coverage Depth",
    description:
      "The breadth of questions in your industry where AI assistants recommend your brand. More coverage means more touchpoints with high-intent prospects.",
  },
];

const frameworks = [
  {
    step: "1",
    title: "Establish Your GEO Baseline",
    description:
      "Before measuring improvement, document your current AI visibility. Query ChatGPT, Gemini, Perplexity, and Claude with industry-relevant questions and record whether your brand appears, how it's described, and what sources are cited.",
  },
  {
    step: "2",
    title: "Set Platform-Specific KPIs",
    description:
      "Each AI engine behaves differently. ChatGPT favors authoritative long-form content, Gemini integrates Google knowledge graph data, and Perplexity prioritizes real-time web sources. Track metrics per platform for actionable insights.",
  },
  {
    step: "3",
    title: "Implement Automated Monitoring",
    description:
      "Manual checking doesn't scale. Use tools that automatically query AI engines with your target keywords and report citation changes, sentiment shifts, and competitive encroachment.",
  },
  {
    step: "4",
    title: "Map Generative Touchpoints to Revenue",
    description:
      "Add UTM parameters to links shared in AI-optimized content. Use post-purchase surveys asking 'How did you hear about us?' and include 'AI assistant' as an option to isolate GEO-driven conversions.",
  },
];

const faqs = [
  {
    q: "How is GEO measurement different from traditional SEO?",
    a: "Traditional SEO tracks rankings, clicks, and impressions on Google SERPs. GEO measurement focuses on AI citation share, brand sentiment in generated responses, and attribution from conversational AI platforms like ChatGPT, Gemini, and Perplexity.",
  },
  {
    q: "What tools can measure AI citation share?",
    a: "Specialized GEO platforms like AutoPilot Geo offer automated AI visibility monitoring across ChatGPT, Gemini, Perplexity, and Claude. Manual alternatives include structured prompt testing with documented baselines and scheduled re-checks.",
  },
  {
    q: "How long before I see GEO success metrics improve?",
    a: "Most businesses see initial AI citation improvements within 4–8 weeks of deploying optimized content. Significant shifts in brand sentiment and conversion attribution typically emerge within 3 months as AI models re-index web sources.",
  },
  {
    q: "Can I track GEO ROI the same way as SEO ROI?",
    a: "Yes, but with adapted attribution models. GEO ROI should include direct conversions from AI-referred traffic, estimated value of increased brand mentions in AI responses, and long-term brand authority lift that precedes direct clicks.",
  },
];

export default function GeoSuccessMetrics() {
  const articleStructuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "How to Measure the Success of Generative Engine Optimization Campaigns",
    description:
      "A comprehensive guide to GEO success metrics including AI citation share, brand sentiment in LLM responses, and conversion attribution from generative search.",
    author: {
      "@type": "Organization",
      name: "AutoPilot Geo",
    },
    publisher: {
      "@type": "Organization",
      name: "AutoPilot Geo",
      logo: {
        "@type": "ImageObject",
        url: "https://autopilotgeo.com/autopilotgeo-logo-light.svg",
      },
    },
    datePublished: "2026-06-09",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": "https://autopilotgeo.com/blog/measuring-geo-success",
    },
  };

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };

  return (
    <>
      <Helmet>
        <title>
          How to Measure GEO Success Metrics | AutoPilot Geo
        </title>
        <meta
          name="description"
          content="Learn how to measure Generative Engine Optimization (GEO) success. Track AI citation share, brand sentiment in LLM responses, and conversion attribution from generative search."
        />
        <link
          rel="canonical"
          href="https://autopilotgeo.com/blog/measuring-geo-success"
        />
        <meta
          property="og:title"
          content="How to Measure GEO Success Metrics | AutoPilot Geo"
        />
        <meta
          property="og:description"
          content="A complete framework for measuring AI citation share, brand sentiment, and conversion attribution from generative search campaigns."
        />
        <meta
          property="og:url"
          content="https://autopilotgeo.com/blog/measuring-geo-success"
        />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">
          {JSON.stringify(articleStructuredData)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(faqStructuredData)}
        </script>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="container flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center">
              <AnimatedLogo size="sm" />
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/blog">
                <Button variant="ghost" size="sm">
                  Blog
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="ghost" size="sm">
                  Pricing
                </Button>
              </Link>
              <Link href="/auth">
                <Button size="sm">Get Started</Button>
              </Link>
            </nav>
          </div>
        </header>

        {/* Hero */}
        <section className="relative py-20 md:py-32 overflow-hidden bg-[hsl(222,47%,11%)]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-emerald-500/10 to-blue-500/10 rounded-full blur-[120px]" />
          <div className="container relative">
            <div className="max-w-4xl mx-auto text-center">
              <Badge
                variant="secondary"
                className="mb-6 bg-white/10 text-white/70 border-white/20"
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                GEO Measurement Framework
              </Badge>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight text-white">
                How to Measure the Success of{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">
                  Generative Engine Optimization
                </span>{" "}
                Campaigns
              </h1>
              <p className="text-xl text-white/70 mb-8 max-w-2xl mx-auto">
                Move beyond rankings. Discover the specific metrics, frameworks,
                and tools that prove your GEO investment is driving real
                business results.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth">
                  <Button
                    size="lg"
                    className="gap-2 bg-gradient-to-r from-emerald-500 to-blue-500 text-white"
                  >
                    Start Tracking GEO Metrics
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="#framework">
                  <Button size="lg" variant="outline" className="text-white border-white/20 hover:bg-white/10">
                    Read the Framework
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Intro */}
        <section className="py-16 md:py-24 bg-white">
          <div className="container">
            <div className="max-w-3xl mx-auto prose prose-lg dark:prose-invert">
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                Generative Engine Optimization (GEO) is rapidly becoming a core
                discipline for brands that want to be discovered by AI
                assistants. But unlike traditional SEO, where you can simply
                check your Google ranking, GEO demands a new measurement
                framework — one that tracks how AI systems perceive, cite, and
                recommend your brand.
              </p>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                This guide explains exactly{" "}
                <strong>
                  how to measure the success of generative engine optimization
                  campaigns
                </strong>
                . Whether you're just starting with GEO or scaling an existing
                program, these metrics will give you the clarity you need to
                justify investment, optimize strategy, and outperform
                competitors in the AI search landscape.
              </p>
              <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg my-8">
                <p className="text-sm text-emerald-900 m-0">
                  <strong>Key Insight:</strong> Users searching for GEO
                  measurement frameworks are looking for actionable KPIs beyond
                  simple rankings. The brands that master these metrics first
                  will capture disproportionate value as AI search adoption
                  accelerates.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Core Metrics */}
        <section className="py-20 bg-muted/30">
          <div className="container">
            <div className="max-w-3xl mx-auto text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                The 6 Essential GEO Success Metrics
              </h2>
              <p className="text-lg text-muted-foreground">
                These are the KPIs that matter for generative engine optimization
                — no vanity numbers, just actionable intelligence.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {metrics.map((m, i) => (
                <GlassCard key={i} className="p-6 h-full">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-gradient-to-br from-emerald-500/10 to-blue-500/10 text-emerald-600 mb-4">
                    {m.icon}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{m.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {m.description}
                  </p>
                </GlassCard>
              ))}
            </div>
          </div>
        </section>

        {/* Deep Dive: AI Citation Share */}
        <section className="py-20 bg-white">
          <div className="container">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Understanding AI Citation Share
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                <strong>AI citation share</strong> is the most fundamental GEO
                metric. It measures what percentage of relevant AI-generated
                responses include your brand name, website, or content as a
                source. Think of it as your "share of voice" inside the AI
                ecosystem.
              </p>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                To calculate it, define a set of target queries that your ideal
                customers might ask an AI assistant. For example, if you sell
                project management software, your query set might include
                "What's the best project management tool for remote teams?" or
                "Compare the top project management software for startups."
              </p>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                Run these queries across ChatGPT, Gemini, Perplexity, and Claude
                at regular intervals. Record whether your brand is mentioned, in
                what context, and whether you're cited as a primary source or
                an also-ran. Your citation share is:
              </p>
              <div className="bg-[hsl(222,47%,11%)] text-white p-6 rounded-xl mb-8">
                <p className="text-center text-lg font-medium m-0">
                  AI Citation Share = (Responses mentioning your brand ÷ Total
                  responses) × 100
                </p>
              </div>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                A citation share above 40% for your core query set is
                considered strong. Below 20% signals that your GEO content
                strategy needs significant work. The goal isn't just presence —
                it's <em>prominent</em> presence in the answers your prospects
                trust.
              </p>
            </div>
          </div>
        </section>

        {/* Deep Dive: Brand Sentiment */}
        <section className="py-20 bg-muted/30">
          <div className="container">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Measuring Brand Sentiment in LLM Responses
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                Being mentioned by an AI assistant is only half the battle. The
                other half is <em>how</em> you're mentioned. Brand sentiment in
                LLM responses can range from enthusiastic endorsement to
                dismissive omission — and everything in between.
              </p>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                To measure sentiment, classify each AI mention into one of three
                categories:
              </p>
              <div className="grid md:grid-cols-3 gap-4 mb-8">
                <GlassCard className="p-5 text-center">
                  <TrendingUp className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
                  <h4 className="font-semibold mb-1">Positive</h4>
                  <p className="text-sm text-muted-foreground">
                    AI recommends you as a top choice, praises specific features,
                    or uses your brand as the primary example.
                  </p>
                </GlassCard>
                <GlassCard className="p-5 text-center">
                  <Search className="h-8 w-8 text-yellow-500 mx-auto mb-3" />
                  <h4 className="font-semibold mb-1">Neutral</h4>
                  <p className="text-sm text-muted-foreground">
                    AI lists you among alternatives without strong endorsement
                    or criticism. You're present but not preferred.
                  </p>
                </GlassCard>
                <GlassCard className="p-5 text-center">
                  <Activity className="h-8 w-8 text-red-500 mx-auto mb-3" />
                  <h4 className="font-semibold mb-1">Negative</h4>
                  <p className="text-sm text-muted-foreground">
                    AI mentions drawbacks, warns about limitations, or actively
                    recommends competitors over you.
                  </p>
                </GlassCard>
              </div>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                Track sentiment trends over time. If your brand sentiment is
                improving, your GEO content is successfully shaping how AI
                models understand your value proposition. A decline signals
                negative coverage, poor review management, or competitor
                content that's winning the narrative battle.
              </p>
            </div>
          </div>
        </section>

        {/* Deep Dive: Conversion Attribution */}
        <section className="py-20 bg-white">
          <div className="container">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Conversion Attribution from Generative Search
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                Ultimately, every marketing investment must prove ROI.
                Conversion attribution from generative search is challenging
                because AI assistants don't always provide clickable links, and
                users may visit your site hours or days after receiving an AI
                recommendation.
              </p>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                Here are three proven methods to attribute conversions to GEO
                efforts:
              </p>
              <div className="space-y-6 mb-8">
                <GlassCard className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                      1
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">
                        UTM-Tagged Content URLs
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        When publishing GEO-optimized content, include
                        UTM-tagged links. Even when AI assistants paraphrase
                        content, users often search for the brand name and land
                        on tagged pages. Filter your analytics for
                        utm_source=ai_search or utm_medium=generative.
                      </p>
                    </div>
                  </div>
                </GlassCard>
                <GlassCard className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                      2
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">
                        Post-Conversion Surveys
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Add "How did you hear about us?" to checkout flows and
                        onboarding surveys. Include "ChatGPT / AI assistant"
                        as a distinct option. This captures indirect
                        attribution that analytics alone will miss.
                      </p>
                    </div>
                  </div>
                </GlassCard>
                <GlassCard className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                      3
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">
                        Brand Search Lift Analysis
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Monitor Google Search Console for branded query
                        volume. A sustained increase in searches for your
                        brand name often correlates with increased AI
                        recommendations, especially when other marketing
                        activities are stable.
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Combine these three methods for the most accurate picture. No
                single attribution approach captures the full customer journey
                through generative search, but together they provide a
                defensible ROI model for your GEO investment.
              </p>
            </div>
          </div>
        </section>

        {/* Framework */}
        <section id="framework" className="py-20 bg-[hsl(222,47%,11%)]">
          <div className="container">
            <div className="max-w-3xl mx-auto text-center mb-14">
              <Badge className="mb-4 bg-white/10 text-white/70 border-white/20">
                <Zap className="h-3 w-3 mr-1" />
                Actionable Framework
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
                The 4-Step GEO Measurement Framework
              </h2>
              <p className="text-lg text-white/70">
                A practical process any team can implement to track and improve
                GEO performance.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {frameworks.map((f, i) => (
                <GlassCard
                  key={i}
                  className="p-6 relative bg-white/5 border-white/10"
                >
                  <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                    {f.step}
                  </div>
                  <h3 className="font-semibold mb-2 text-white">{f.title}</h3>
                  <p className="text-sm text-white/70 leading-relaxed">
                    {f.description}
                  </p>
                </GlassCard>
              ))}
            </div>
          </div>
        </section>

        {/* How AutoPilot Geo Helps */}
        <section className="py-20 bg-white">
          <div className="container">
            <div className="max-w-3xl mx-auto text-center mb-14">
              <Badge className="mb-4 bg-violet-100 text-violet-700 border-violet-200">
                <Sparkles className="h-3 w-3 mr-1" />
                AutoPilot Geo
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Automate Your GEO Success Tracking
              </h2>
              <p className="text-lg text-muted-foreground">
                Manually measuring GEO metrics is unsustainable. AutoPilot Geo
                provides automated monitoring, scoring, and reporting for every
                metric in this guide.
              </p>
            </div>
            <div className="max-w-3xl mx-auto space-y-4">
              {[
                {
                  title: "AI Visibility Monitoring",
                  desc: "Track how ChatGPT, Gemini, Perplexity, and Claude mention your brand across hundreds of industry queries. Get real-time alerts when your citation share changes.",
                },
                {
                  title: "Citation Score Engine",
                  desc: "Our proprietary scoring system evaluates the quality and prominence of your AI mentions, not just quantity. Understand whether you're a footnote or a featured recommendation.",
                },
                {
                  title: "Competitive GEO Intelligence",
                  desc: "See exactly where competitors out-cite you in AI responses. Get prioritized recommendations to close the gap and overtake them in generative search.",
                },
                {
                  title: "GEO-Optimized Content Generation",
                  desc: "Create content specifically structured for AI citation. Our AI writes in formats that LLMs prefer to quote, reference, and recommend.",
                },
              ].map((item, i) => (
                <GlassCard key={i} className="p-6 flex items-start gap-4">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                </GlassCard>
              ))}
            </div>
            <div className="text-center mt-12">
              <Link href="/auth">
                <Button
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-emerald-500 to-blue-500 text-white"
                >
                  Start Measuring GEO Success
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 bg-muted/30">
          <div className="container">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold mb-10 text-center">
                Frequently Asked Questions
              </h2>
              <div className="space-y-6">
                {faqs.map((f, i) => (
                  <div key={i} className="bg-white rounded-xl p-6 border border-border">
                    <h3 className="font-semibold mb-2 flex items-start gap-2">
                      <Target className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                      {f.q}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {f.a}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-emerald-500/10 to-blue-500/10">
          <div className="container">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to Prove Your GEO ROI?
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Join brands that already track, measure, and optimize their AI
                visibility with AutoPilot Geo.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth">
                  <Button
                    size="lg"
                    className="gap-2 bg-gradient-to-r from-emerald-500 to-blue-500 text-white"
                  >
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button size="lg" variant="outline">
                    View Pricing
                  </Button>
                </Link>
              </div>
              <p className="text-sm text-muted-foreground mt-6">
                No credit card required • AI visibility audit included • Cancel
                anytime
              </p>
            </div>
          </div>
        </section>

        <PublicFooter />
      </div>
    </>
  );
}
