"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  Zap,
  BarChart3,
  Search,
  Target,
  FileText,
  Globe,
  TrendingUp,
  Sparkles,
  Clock,
  Shield,
  Star,
} from "lucide-react";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { useAuth } from "@/contexts/AuthContext";

import geminiLogo from "@/assets/gemini-logo.png";
import claudeLogo from "@/assets/claude-logo.png";
import perplexityLogo from "@/assets/perplexity-logo.png";
import chatgptIcon from "@/assets/chatgpt-icon.png";

const benefits = [
  {
    icon: <Search className="h-6 w-6" />,
    title: "AI-Powered Keyword Research",
    description: "Discover high-intent keywords your competitors miss. Our AI analyzes search patterns across Google and AI platforms to find your best opportunities.",
  },
  {
    icon: <FileText className="h-6 w-6" />,
    title: "Expert Content Generation",
    description: "1,500+ word articles written by AI, optimized for both Google rankings and AI citations. Published automatically to your CMS.",
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: "AI Visibility Monitoring",
    description: "Track how ChatGPT, Gemini, Perplexity and Claude mention your brand. Get real-time alerts when your visibility changes.",
  },
  {
    icon: <Target className="h-6 w-6" />,
    title: "Competitor Analysis",
    description: "See exactly where competitors outrank you in AI search results. Get actionable recommendations to overtake them.",
  },
  {
    icon: <Globe className="h-6 w-6" />,
    title: "Auto-Publishing to Your CMS",
    description: "One-click integration with WordPress, Shopify, Wix, and more. Articles published daily without lifting a finger.",
  },
  {
    icon: <TrendingUp className="h-6 w-6" />,
    title: "Google Search Console Integration",
    description: "Connect your GSC data to track real ranking improvements, click growth, and indexing status automatically.",
  },
];

const results = [
  { value: "4.5x", label: "More AI visibility" },
  { value: "+180%", label: "Impressions increase" },
  { value: "+90%", label: "Click growth" },
  { value: "50+", label: "Industries served" },
];

const steps = [
  {
    step: "1",
    title: "Enter your website URL",
    description: "Our AI scans your site in 30 seconds and identifies your best SEO opportunities.",
  },
  {
    step: "2",
    title: "Get your AI SEO strategy",
    description: "Receive a complete keyword plan, content calendar, and optimization roadmap tailored to your business.",
  },
  {
    step: "3",
    title: "Watch your rankings grow",
    description: "Articles are generated and published daily. Track your progress in real-time on your dashboard.",
  },
];

const testimonials = [
  {
    name: "Ben M.",
    role: "Founder, AutoPilot GEO",
    text: "I used AutoPilot GEO on my own projects. The blog now drives 60 organic visits/month from Google with zero manual effort.",
    rating: 5,
  },
  {
    name: "500+ active sites",
    role: "Across all plans",
    text: "Our users publish thousands of AI-optimized articles every month. Average traffic lift: +60% in 3 months.",
    rating: 5,
  },
  {
    name: "4.9 / 5",
    role: "289 reviews on TrustAvis",
    text: "Rated Excellent by our customers — independent reviews collected via TrustAvis.",
    rating: 5,
  },
];

const faqs = [
  {
    q: "What is AI SEO?",
    a: "AI SEO is the practice of optimizing your content to be discovered and recommended by AI search engines like ChatGPT, Gemini, and Perplexity, in addition to traditional Google search.",
  },
  {
    q: "How is AI SEO different from traditional SEO?",
    a: "Traditional SEO focuses on Google rankings. AI SEO ensures your brand is also cited and recommended by AI assistants, which now handle over 1.5 billion searches per month.",
  },
  {
    q: "How quickly will I see results?",
    a: "Most clients see their first ranking improvements within 2-4 weeks. Significant traffic increases typically happen within 2-3 months.",
  },
  {
    q: "Do I need technical skills?",
    a: "No. Enter your website URL and we handle everything: keyword research, content creation, publishing, and monitoring.",
  },
  {
    q: "What CMS do you support?",
    a: "WordPress, Shopify, Wix, Webflow, BigCommerce, and any CMS with an API. We also offer a hosted blog option.",
  },
];

export default function AiSeo() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) router.push("/dashboard");
  }, [user, router]);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  return (
    <>
      <Helmet>
        <title>AI SEO Services – Get Found by ChatGPT & Google</title>
        <meta
          name="description"
          content="AI SEO services to get your brand recommended by ChatGPT, Gemini, Perplexity & Google. Automated content and visibility monitoring."
        />
        <link rel="canonical" href="https://autopilotgeo.com/ai-seo" />
        <meta property="og:title" content="AI SEO Services – Get Found by AI Search Engines" />
        <meta property="og:description" content="Get your brand recommended by ChatGPT, Gemini, Perplexity and Google with AI-powered SEO." />
        <meta property="og:url" content="https://autopilotgeo.com/ai-seo" />
        <meta property="og:type" content="website" />
        <script
          type="application/ld+json"
          children={JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: "AI SEO Services by AutoPilot Geo",
            description: "AI-powered SEO service that optimizes your content for Google and AI search engines like ChatGPT, Gemini, and Perplexity.",
            provider: { "@type": "Organization", name: "AutoPilot Geo", url: "https://autopilotgeo.com" },
            offers: { "@type": "Offer", price: "29", priceCurrency: "USD", description: "Starting at $29/month" },
            areaServed: "Worldwide",
          })}
        />
        <script
          type="application/ld+json"
          children={JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "name": "AI SEO FAQ",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          })}
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Nav */}
        <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-[hsl(222,47%,11%)]/90 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between px-4">
            <Link href="/" className="flex items-center">
              <AnimatedLogo size="md" />
            </Link>
            <div className="flex items-center gap-2">
              <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 hidden sm:inline-flex" asChild>
                <Link href="/pricing">Pricing</Link>
              </Button>
              <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 hidden sm:inline-flex" asChild>
                <Link href="/auth">Log in</Link>
              </Button>
              <Button className="bg-white text-[hsl(222,47%,11%)] hover:bg-white/90 font-semibold" asChild>
                <Link href="/onboarding">Start Free Trial</Link>
              </Button>
            </div>
          </div>
        </nav>

        {/* ═══ HERO ═══ */}
        <section className="relative overflow-hidden bg-[hsl(222,47%,11%)] pt-28 md:pt-36 pb-20 md:pb-28">
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[150px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-indigo-500/8 rounded-full blur-[120px]" />

          <div className="container relative px-4">
            <div className="mx-auto max-w-4xl text-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/70 mb-6">
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  AI SEO Services
                </div>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]"
              >
                AI SEO that gets you{" "}
                <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  discovered
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-8"
              >
                Get your brand recommended by ChatGPT, Gemini, Perplexity and Google.
                Automated content creation, AI visibility monitoring, and real SEO results — starting at $29/mo.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-3 justify-center mb-6"
              >
                <Button
                  size="lg"
                  className="h-13 px-8 bg-white text-[hsl(222,47%,11%)] hover:bg-white/90 text-base font-bold gap-2 shadow-lg"
                  onClick={() => router.push("/onboarding")}
                >
                  Get Your Free AI SEO Audit
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="flex flex-wrap items-center justify-center gap-4 text-sm text-white/50"
              >
                <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-green-400" /> No credit card required</span>
                <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-green-400" /> Setup in 2 minutes</span>
                <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-green-400" /> Cancel anytime</span>
              </motion.div>

              {/* AI platforms */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mt-12 flex items-center justify-center gap-8"
              >
                <span className="text-xs text-white/30 uppercase tracking-widest">Optimized for</span>
                {[
                  { name: "ChatGPT", logo: chatgptIcon },
                  { name: "Gemini", logo: geminiLogo },
                  { name: "Perplexity", logo: perplexityLogo },
                  { name: "Claude", logo: claudeLogo },
                ].map((p) => (
                  <img key={p.name} src={p.logo as unknown as string} alt={`${p.name} AI logo`} className="h-7 w-7 rounded-lg opacity-50 hover:opacity-80 transition-opacity" />
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══ RESULTS BAR ═══ */}
        <section className="bg-[hsl(222,47%,14%)] border-y border-white/5 py-10">
          <div className="container px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
              {results.map((r, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className="text-3xl md:text-4xl font-extrabold text-white">{r.value}</div>
                  <div className="text-sm text-white/50 mt-1">{r.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ BENEFITS ═══ */}
        <section className="bg-white py-20 md:py-28">
          <div className="container px-4">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-[hsl(222,47%,11%)] mb-4">
                Everything you need for AI SEO
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                A complete AI SEO platform that handles keyword research, content creation, publishing, and performance tracking.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {benefits.map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-xl border border-border bg-card p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-[hsl(222,47%,11%)]/5 text-[hsl(222,47%,11%)] mb-4">
                    {b.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{b.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ HOW IT WORKS ═══ */}
        <section className="bg-[hsl(222,47%,97%)] py-20 md:py-28">
          <div className="container px-4">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-[hsl(222,47%,11%)] mb-4">
                How AI SEO works
              </h2>
              <p className="text-lg text-muted-foreground">Get started in under 2 minutes. No technical skills required.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {steps.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="text-center"
                >
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[hsl(222,47%,11%)] text-white text-xl font-bold mb-5">
                    {s.step}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-12">
              <Button
                size="lg"
                className="h-13 px-8 bg-[hsl(222,47%,11%)] text-white hover:bg-[hsl(222,47%,16%)] text-base font-bold gap-2"
                onClick={() => router.push("/onboarding")}
              >
                Start Your Free AI SEO Audit
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {/* ═══ TESTIMONIALS ═══ */}
        <section className="bg-white py-20 md:py-28">
          <div className="container px-4">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-[hsl(222,47%,11%)] mb-4">
                Trusted by businesses worldwide
              </h2>
              <p className="text-lg text-muted-foreground">Real results from real AI SEO customers.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {testimonials.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm text-foreground mb-4 leading-relaxed">"{t.text}"</p>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ PRICING CTA ═══ */}
        <section className="bg-[hsl(222,47%,11%)] py-20 md:py-28">
          <div className="container px-4">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Start your AI SEO journey today
              </h2>
              <p className="text-lg text-white/60 mb-6 max-w-xl mx-auto">
                Join hundreds of businesses using AI SEO to get found by ChatGPT, Gemini, and Google. Plans start at $29/month.
              </p>

              <div className="inline-flex flex-col sm:flex-row gap-3 mb-8">
                <Button
                  size="lg"
                  className="h-13 px-8 bg-white text-[hsl(222,47%,11%)] hover:bg-white/90 text-base font-bold gap-2"
                  onClick={() => router.push("/onboarding")}
                >
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-13 px-8 border-white/20 text-white bg-white/5 hover:bg-white/10 text-base"
                  asChild
                >
                  <Link href="/pricing">View Pricing</Link>
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-white/40">
                <span className="flex items-center gap-1.5"><Shield className="h-4 w-4" /> No credit card required</span>
                <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> 2-minute setup</span>
                <span className="flex items-center gap-1.5"><Zap className="h-4 w-4" /> First results in 2 weeks</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        <section className="bg-white py-20 md:py-28">
          <div className="container px-4">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-[hsl(222,47%,11%)] mb-4">
                AI SEO – Frequently Asked Questions
              </h2>
            </div>
            <div className="max-w-2xl mx-auto space-y-4">
              {faqs.map((f, i) => (
                <details key={i} className="group rounded-xl border border-border bg-card p-0 overflow-hidden">
                  <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-base font-medium text-foreground hover:bg-accent/50 transition-colors">
                    {f.q}
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <PublicFooter />
      </div>
    </>
  );
}
