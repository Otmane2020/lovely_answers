"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  Globe,
  FileText,
  Star,
  TrendingUp,
  BarChart3,
  Search,
  Eye,
  Target,
  MessageSquare,
  X,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ShoppingVisibilitySection } from "@/components/landing/ShoppingVisibilitySection";
import { ShopifyIntegrationSection } from "@/components/landing/ShopifyIntegrationSection";
import { TrafficGrowthSection } from "@/components/landing/TrafficGrowthSection";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { useAuth } from "@/contexts/AuthContext";
import { GoogleOneTap } from "@/components/GoogleOneTap";
import { InactivityPopup } from "@/components/InactivityPopup";
import { SocialProofToast } from "@/components/nudges/SocialProofToast";
import { ExitIntentPopup } from "@/components/nudges/ExitIntentPopup";
import demoVideo from "@/assets/demo.mp4.asset.json";
import ugcDesktop from "@/assets/ugc-desktop.mp4.asset.json";
import ugcMobile from "@/assets/ugc-mobile.mp4.asset.json";
import { useVideoTracking } from "@/hooks/useVideoTracking";




const aiPlatforms = [
  { name: "Google", color: "#4285f4" },
  { name: "ChatGPT", color: "#10a37f" },
  { name: "Gemini", color: "#4285f4" },
  { name: "Perplexity", color: "#6366f1" },
  { name: "Shopping", color: "#f59e0b" },
];

const socialProofPills = [
  { initial: "5", bg: "#dbeafe", color: "#1e3a8a", name: "500+", role: "active sites", result: "ranking on AI" },
  { initial: "★", bg: "#fef3c7", color: "#92400e", name: "4.9 / 5", role: "founder reviews", result: "Excellent" },
  { initial: "+", bg: "#d1fae5", color: "#065f46", name: "+60%", role: "avg traffic", result: "in 3 months" },
];


const beforeItems = [
  "Your brand never appears in ChatGPT answers",
  "Competitors get cited by Gemini & Perplexity",
  "Zero presence in AI search results",
  "Traffic flat while AI search grows 40%/year",
];

const afterItems = [
  "ChatGPT, Gemini & Perplexity cite your brand",
  "GEO-optimized content auto-generated daily",
  "Rank in AI Overviews and answer boxes",
  "+60% avg traffic from generative search",
];

const heroStats = [
  { value: "4.5", suffix: "x", label: "More AI citations" },
  { value: "9.7", suffix: "x", label: "More brand mentions in AI" },
  { value: "60", suffix: "%", label: "GEO traffic increase avg" },
  { value: "$49", suffix: "/mo", label: "From" },
];

const featureCards = [
  {
    icon: <Eye className="h-5 w-5" />,
    title: "GEO Visibility Score",
    description: "See exactly how visible your brand is across ChatGPT, Gemini, Perplexity and Claude — and how you rank against competitors.",
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: "AI Citation Tracking",
    description: "Monitor every time AI engines recommend your business — or your competitors — in real-time generative search results.",
  },
  {
    icon: <Target className="h-5 w-5" />,
    title: "GEO Content Optimization",
    description: "Get actionable insights to optimize your content for AI citation, entity recognition and generative engine ranking.",
  },
];

const showcaseFeatures = [
  {
    tag: "MONITOR YOUR GEO PRESENCE",
    title: "Track your visibility across all generative AI engines",
    description: "Real-time monitoring of how ChatGPT, Gemini, Perplexity and Claude mention and cite your brand in AI search answers.",
  },
  {
    tag: "OPTIMIZE FOR AI CITATION",
    title: "GEO content that AI search engines cite",
    description: "Generate structured, authoritative content specifically designed to be recommended by generative AI search engines.",
  },
  {
    tag: "SCALE ON AUTOPILOT",
    title: "Automated GEO publishing & optimization",
    description: "1 GEO-optimized piece per day, auto-published to your CMS with full generative engine optimization.",
  },
];

// Testimonials removed — replaced by neutral stat pills in hero.

const bottomFeatures = [
  {
    icon: <Search className="h-5 w-5" />,
    title: "GEO Keyword Research",
    description: "AI-powered keyword discovery targeting generative search queries and conversational intent.",
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: "GEO Content Generation",
    description: "Expert-level articles optimized for both Google AI Overviews and standalone generative engines.",
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: "Auto-Publishing",
    description: "Direct integration with WordPress, Shopify, Wix, and more — with GEO markup included.",
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: "GEO Analytics",
    description: "Track your growth across Google Search Console, AI platform mentions and generative search visibility.",
  },
];

const faqs = [
  {
    question: "What is Generative Engine Optimization (GEO)?",
    answer:
      "GEO is the practice of optimizing your content and online presence so that generative AI engines like ChatGPT, Gemini, Perplexity and Claude recommend your brand in their answers. It goes beyond traditional SEO to target how AI understands, cites and presents your business.",
  },
  {
    question: "How is GEO different from SEO?",
    answer:
      "SEO targets traditional search engine ranking (Google blue links). GEO targets AI-powered answers — the responses ChatGPT, Gemini and Perplexity generate when users ask about products or services in your industry. You need both.",
  },
  {
    question: "Can I really cancel anytime?",
    answer: "Yes, 1-click cancellation. No questions asked, no hidden fees.",
  },
  {
    question: "Do I need technical skills for GEO?",
    answer: "No, we handle everything. Just enter your website URL and our GEO engine analyzes your brand, competitors and generative search landscape automatically.",
  },
  {
    question: "Will GEO work for my industry?",
    answer: "Yes, proven in 50+ industries including healthcare, legal, e-commerce, SaaS, and local services. Any business that customers might ask AI about benefits from GEO.",
  },
  {
    question: "Is the GEO content actually good?",
    answer:
      "Every piece: 1,500+ words, expert-level, structured for AI citation with sources and entity markup. Generative engines care about authority and clarity — we optimize for both.",
  },
];

export default function Index() {

  const [aiReferrer, setAiReferrer] = useState<string | null>(null);
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const demoTracking = useVideoTracking("demo");
  const ugcDesktopTracking = useVideoTracking("ugc_desktop");
  const ugcMobileTracking = useVideoTracking("ugc_mobile");


  useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard");
  }, [user, authLoading, router]);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    try {
      const ref = (document.referrer || "").toLowerCase();
      const params = new URLSearchParams(window.location.search);
      const utm = (params.get("utm_source") || "").toLowerCase();
      const match =
        /chatgpt|openai/.test(ref) || /chatgpt|openai/.test(utm)
          ? "ChatGPT"
          : /perplexity/.test(ref) || /perplexity/.test(utm)
          ? "Perplexity"
          : /gemini|bard|google\.com\/search\?.*ai/.test(ref) || /gemini/.test(utm)
          ? "Gemini"
          : /claude|anthropic/.test(ref) || /claude/.test(utm)
          ? "Claude"
          : null;
      if (match) setAiReferrer(match);
    } catch {}
  }, []);


  return (
    <>
      <SocialProofToast />
      <ExitIntentPopup />
      <Helmet>
        <title>GEO Platform for ChatGPT, Gemini & Perplexity | AutoPilot</title>
        <meta
          name="description"
          content="Get cited by ChatGPT, Gemini, Perplexity & Google AI Overviews. Automated GEO content, AEO answers and AI SEO — start free."
        />
        <link rel="canonical" href="https://autopilotgeo.com/" />
        <meta property="og:title" content="GEO Platform for ChatGPT, Gemini & Perplexity | AutoPilot" />
        <meta
          property="og:description"
          content="Get cited by ChatGPT, Gemini, Perplexity & Google AI Overviews. Automated GEO content, AEO answers and AI SEO — start free."
        />
        <meta property="og:url" content="https://autopilotgeo.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://autopilotgeo.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <script
          type="application/ld+json"
          children={JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "AutoPilot Geo",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            offers: { "@type": "Offer", price: "29", priceCurrency: "USD" },
            aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", reviewCount: "527", bestRating: "5" },
          })}
        />
        <script
          type="application/ld+json"
          children={JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          })}
        />
      </Helmet>

      <div className="min-h-screen" style={{ background: "#f8f7f4" }}>
        <GoogleOneTap />
        <InactivityPopup inactivityDelay={45} />


        {/* NAV */}
        <nav className="fixed top-0 z-50 w-full bg-white border-b border-gray-100 shadow-sm">


          <div className="container flex h-16 items-center justify-between px-4">
            <Link href="/" className="flex items-center">
              <AnimatedLogo size="md" />
            </Link>
            <div className="hidden md:flex items-center gap-1">
              <Button variant="ghost" className="text-gray-600 hover:text-gray-900" asChild>
                <Link href="/pricing">Pricing</Link>
              </Button>
              <Button variant="ghost" className="text-gray-600 hover:text-gray-900" asChild>
                <Link href="/blog">Blog</Link>
              </Button>
              <Button variant="ghost" className="text-gray-600 hover:text-gray-900" asChild>
                <Link href="/auth">Log in</Link>
              </Button>
              <Button variant="outline" className="ml-1 rounded-xl" asChild>
                <Link href="/dashboard">Open App</Link>
              </Button>
              <Button className="ml-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl px-5" asChild>
                <Link href="/checkout?plan=pro&cycle=annual">Start free trial →</Link>
              </Button>
            </div>
            <div className="flex md:hidden items-center gap-2">
              <Button variant="ghost" size="sm" className="text-gray-600" asChild>
                <Link href="/dashboard">App</Link>
              </Button>
              <Button size="sm" className="bg-gray-900 text-white hover:bg-gray-800 rounded-lg" asChild>
                <Link href="/checkout?plan=pro&cycle=annual">Start Free</Link>
              </Button>
            </div>
          </div>
        </nav>

        <main>
        {/* HERO */}
        <section
          className="relative pt-40 md:pt-44 pb-20 md:pb-28 overflow-hidden"
          style={{ background: "linear-gradient(180deg, #ffffff 0%, #f8f7f4 100%)" }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.055) 0%, transparent 70%)",
            }}
          />
          <div className="container relative px-4">
            <div className="mx-auto max-w-3xl text-center">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 text-sm text-gray-600 mb-7 shadow-sm"
              >
                <span className="w-2 h-2 rounded-full bg-green-500" style={{ animation: "pulse-dot 2s infinite" }} />
                500+ businesses growing with AI search
              </motion.div>

              <h1
                className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-gray-900 mb-5 leading-[1.08]"
                style={{ letterSpacing: "-0.03em" }}
              >
                The #1 GEO platform.
                <br />
                <span className="text-blue-600">Grow your Traffic ..</span>
                <br />
                Win generative search.
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg md:text-xl text-gray-700 max-w-xl mx-auto mb-9 leading-relaxed"
              >
                AutoPilot GEO is the first platform built purely for{" "}
                <span className="font-semibold text-gray-700">Generative Engine Optimization</span>. We create, optimize and
                publish content that ChatGPT, Gemini, Perplexity and Google AI Overviews cite —
                so customers find you when they ask AI.
              </motion.p>


              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-3 justify-center mb-4"
              >
                <Button
                  size="lg"
                  className="px-8 bg-gray-900 text-white hover:bg-gray-800 text-base font-semibold gap-2 rounded-xl shadow-lg"
                  style={{ height: "52px" }}
                  asChild
                >
                  <Link href="/checkout?plan=pro&cycle=annual">
                    Start GEO free trial
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 border-gray-200 text-gray-700 bg-white hover:bg-gray-50 text-base rounded-xl"
                  style={{ height: "52px" }}
                  onClick={() => {
                    const el = document.getElementById("features");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  See GEO in action
                </Button>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
                className="text-sm text-gray-600 mb-12"
              >
                3-day free trial · <span className="text-gray-600 font-medium">Card required</span> · Cancel anytime
              </motion.p>


              {/* Social proof pills */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="flex flex-wrap gap-2 justify-center mb-12"
              >
                {socialProofPills.map((p, i) => (
                  <div
                    key={i}
                    className="inline-flex items-center gap-2 bg-white border border-gray-100 rounded-full px-4 py-2 text-sm text-gray-600 shadow-sm"
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: p.bg, color: p.color }}
                    >
                      {p.initial}
                    </div>
                    <span>
                      {p.name} · {p.role} ·
                    </span>
                    <span className="font-semibold text-gray-900">{p.result}</span>
                  </div>
                ))}
              </motion.div>

              {/* Before / After */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto mb-12"
              >
                <div className="bg-white border border-gray-100 rounded-2xl p-5 text-left shadow-sm">
                  <p className="text-xs font-bold tracking-widest text-red-500 uppercase mb-4">
                    ✕ Without AutoPilot Geo
                  </p>
                  {beforeItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 mb-3">
                      <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <X className="h-3 w-3 text-red-500" />
                      </div>
                      <span className="text-sm text-gray-700 leading-snug">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-blue-100 rounded-2xl p-5 text-left shadow-sm">
                  <p className="text-xs font-bold tracking-widest text-green-600 uppercase mb-4">
                    ✓ With AutoPilot Geo
                  </p>
                  {afterItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 mb-3">
                      <div className="w-5 h-5 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-green-600" />
                      </div>
                      <span className="text-sm text-gray-700 leading-snug font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.7 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto mb-12"
              >
                {heroStats.map((stat, i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-2xl px-4 py-4 text-center shadow-sm">
                    <div className="text-2xl font-extrabold text-gray-900 leading-none">
                      {stat.value}
                      <span className="text-blue-500 text-lg">{stat.suffix}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1.5">{stat.label}</p>
                  </div>
                ))}
              </motion.div>

              {/* Platform pills */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Optimizes your presence on</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {aiPlatforms.map((p) => (
                    <div
                      key={p.name}
                      className="inline-flex items-center gap-2 bg-white border border-gray-100 rounded-full px-4 py-2 text-sm text-gray-600 font-medium shadow-sm"
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                      {p.name}
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
          <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
        </section>

        {/* Product Demo Video */}
        <section className="py-16 md:py-24 bg-white">
          <div className="container px-4 max-w-5xl">
            <div className="text-center mb-10">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-3">
                GEO Engine demo
              </span>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4" style={{ letterSpacing: "-0.02em" }}>
                See the GEO Engine in action
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                One platform optimizes your brand for generative AI — across ChatGPT, Gemini, Perplexity, Google AI Overviews and Shopping.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-100 bg-black">
              <video
                src={demoVideo.url}
                controls
                playsInline
                preload="metadata"
                width={1920}
                height={1080}
                className="w-full h-auto block"
                {...demoTracking}
              />
            </div>
          </div>
        </section>

        {/* UGC / Ads video */}
        <section className="py-16 md:py-24" style={{ background: "linear-gradient(180deg,#0a0a1a 0%,#141432 50%,#1e1e5a 100%)" }}>
          <div className="container px-4">
            <div className="text-center mb-10">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-emerald-300 mb-3">
                Real creators · Real results
              </span>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4" style={{ letterSpacing: "-0.02em" }}>
                Why founders switch to AutoPilot GEO
              </h2>
              <p className="text-lg text-white/70 max-w-2xl mx-auto">
                Hear it straight from the people using it every day.
              </p>
            </div>

            {/* Desktop video (16:9) */}
            <div className="hidden md:block max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-[0_30px_80px_-20px_rgba(79,70,229,.5)] bg-black">
              <video
                src={ugcDesktop.url}
                controls
                playsInline
                preload="metadata"
                width={1920}
                height={1080}
                className="w-full h-auto block"
                {...ugcDesktopTracking}
              />
            </div>

            {/* Mobile reel (9:16) */}
            <div className="md:hidden max-w-xs mx-auto rounded-2xl overflow-hidden shadow-[0_30px_80px_-20px_rgba(79,70,229,.5)] bg-black">
              <video
                src={ugcMobile.url}
                controls
                playsInline
                preload="metadata"
                width={1080}
                height={1920}
                className="w-full h-auto block"
                {...ugcMobileTracking}
              />
            </div>

            <div className="mt-8 text-center">
              <Link href="/checkout?plan=pro&cycle=annual">
                <Button size="lg" className="bg-white text-gray-900 hover:bg-white/90 h-12 px-6">
                  Start free trial <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <ShoppingVisibilitySection />
        <ShopifyIntegrationSection />
        <TrafficGrowthSection />


        {/* AI Platform Logos */}
        <section className="py-10 md:py-14 border-b border-gray-100 bg-white">
          <div className="container px-4">
            <p className="text-center text-sm text-gray-600 mb-6 uppercase tracking-widest">
              Optimize your presence across all major AI platforms
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
              {aiPlatforms.map((platform) => (
                <div
                  key={platform.name}
                  className="inline-flex items-center gap-2 bg-white border border-gray-100 rounded-full px-5 py-2.5 shadow-sm"
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: platform.color }} />
                  <span className="text-sm font-semibold text-gray-700">{platform.name}</span>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="container px-4">
            <div className="text-center mb-12">
              <h2
                className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4"
                style={{ letterSpacing: "-0.02em" }}
              >
                Generative search is the <span className="text-blue-600 font-extrabold">new growth channel</span>
              </h2>
              <p className="text-gray-700 text-lg max-w-xl mx-auto">
                Businesses cited by AI engines get more trust, more clicks, more customers. GEO is how you get there.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {[
                { value: "4.5x", label: "More AI citations" },
                { value: "9.7x", label: "More AI brand mentions" },
                { value: "60%", label: "GEO traffic increase avg" },
                { value: "1.5bn", label: "Generative queries monthly" },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center bg-gray-50 rounded-2xl p-6 border border-gray-100"
                >
                  <div
                    className="text-4xl md:text-5xl font-extrabold text-gray-900"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    {stat.value}
                  </div>
                  <p className="text-sm text-gray-700 mt-2">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-16 md:py-24" style={{ background: "#f8f7f4" }}>
          <div className="container px-4">
            <div className="text-center mb-12">
              <h2
                className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4"
                style={{ letterSpacing: "-0.02em" }}
              >
                Understand how generative AI talks about <span className="text-blue-600 font-extrabold">your brand</span>
              </h2>
              <p className="text-gray-700 text-lg max-w-2xl mx-auto">
                Monitor and optimize your brand's presence across every major generative AI engine.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {featureCards.map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-2xl border border-gray-100 bg-white p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
                    {card.icon}
                  </div>
                  <h3 className="font-semibold text-lg text-gray-900 mb-2">{card.title}</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{card.description}</p>
                  <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-3 h-28 flex items-end gap-1">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <div
                        key={j}
                        className="flex-1 rounded-t bg-blue-200"
                        style={{ height: `${30 + (j + 1) * 8}%`, opacity: 0.4 + j * 0.08 }}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials removed — see neutral stat pills in hero */}


        {/* Showcase */}
        <section className="py-16 md:py-24" style={{ background: "#f8f7f4" }}>
          <div className="container px-4">
            <div className="text-center mb-12">
              <h2
                className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4"
                style={{ letterSpacing: "-0.02em" }}
              >
                Turn generative AI into a <span className="text-blue-600 font-extrabold">growth channel</span>
              </h2>
              <p className="text-gray-700 text-lg max-w-2xl mx-auto">
                Track, optimize, and grow your citations in AI-powered search results.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
              {showcaseFeatures.map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm"
                >
                  <div className="h-40 bg-gray-900 p-5 flex items-end">
                    <div className="rounded-lg bg-white/10 p-3 w-full">
                      <div className="h-2 bg-white/25 rounded w-3/4 mb-1.5" />
                      <div className="h-2 bg-white/10 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="p-5">
                    <span className="text-[10px] font-bold tracking-widest text-blue-500 uppercase">{feature.tag}</span>
                    <h3 className="font-semibold text-gray-900 mt-1 mb-2">{feature.title}</h3>
                    <p className="text-sm text-gray-700">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {bottomFeatures.map((f, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 text-center shadow-sm">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mx-auto mb-3">
                    {f.icon}
                  </div>
                  <h4 className="font-semibold text-sm text-gray-900 mb-1">{f.title}</h4>
                  <p className="text-xs text-gray-600">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 md:py-24 bg-white">
          <div className="container px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900" style={{ letterSpacing: "-0.02em" }}>
                Frequently Asked Questions
              </h2>
            </div>
            <div className="max-w-2xl mx-auto">
              <Accordion type="single" collapsible className="space-y-3">
                {faqs.map((faq, i) => (
                  <AccordionItem
                    key={i}
                    value={`faq-${i}`}
                    className="rounded-xl border border-gray-100 bg-gray-50 px-5 transition-all hover:border-gray-200"
                  >
                    <AccordionTrigger className="text-left font-medium text-gray-900 py-4 hover:no-underline text-sm md:text-base">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-gray-700 text-sm pb-4">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <p className="text-center text-sm text-gray-700 mt-8">
                New to the space?{" "}
                <Link
                  href="/blog/aeo-vs-geo"
                  className="text-violet-600 font-medium hover:underline"
                >
                  Read our guide: AEO vs GEO — what is the difference between answer engine and generative engine optimization
                </Link>
                .
              </p>
            </div>
          </div>
        </section>


        {/* Dark CTA */}
        <section className="relative overflow-hidden bg-gray-900 py-20 md:py-32">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)" }}
          />
          <div className="container relative px-4">
            <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2
                  className="text-3xl md:text-5xl font-bold text-white leading-tight mb-6"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  Buyers ask AI which brand to choose.
                </h2>
                <p className="text-gray-400 text-lg mb-8">
                  Make sure it's yours. Get cited by ChatGPT, Gemini, Perplexity and Google AI Overviews today.
                </p>
                <Button
                  size="lg"
                  className="px-8 bg-white text-gray-900 hover:bg-gray-100 text-base font-semibold gap-2 rounded-xl"
                  style={{ height: "52px" }}
                  asChild
                >
                  <Link href="/checkout?plan=pro&cycle=annual">
                    Start GEO free trial <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <MessageSquare className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-400 text-sm font-medium">AI Assistant</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <div className="px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm max-w-[80%]">
                      What's the best SEO tool for small businesses?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="px-4 py-2.5 rounded-xl bg-white/5 text-gray-300 text-sm max-w-[90%]">
                      Based on recent data, I'd recommend{" "}
                      <span className="text-white font-semibold">your-brand.com</span> — they specialize in Generative Engine
                      Optimization and consistently rank in AI search results for small businesses.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-gray-900 py-14 md:py-20 border-t border-white/5">
          <div className="container px-4 text-center">
            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4" style={{ letterSpacing: "-0.02em" }}>
              Own generative search.
            </h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Start your GEO free trial and get your brand cited by AI search engines.
            </p>
            <Button
              size="lg"
              className="px-10 bg-white text-gray-900 hover:bg-gray-100 text-base font-semibold gap-2 rounded-xl shadow-lg"
              style={{ height: "52px" }}
              asChild
            >
              <Link href="/checkout?plan=pro&cycle=annual">
                Start your GEO free trial <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="text-gray-300 text-sm mt-4">Card required · Cancel anytime</p>

          </div>
        </section>
        </main>

        <PublicFooter />

        {/* Sticky Mobile CTA */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 p-3 bg-white border-t border-gray-100 shadow-2xl">
          <Button
            className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white font-semibold gap-2 rounded-xl"
            asChild
          >
            <Link href="/checkout?plan=pro&cycle=annual">
              Start GEO free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
