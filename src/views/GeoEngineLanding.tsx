"use client";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  Sparkles,
  Search,
  MessageSquare,
  MapPin,
  ShoppingBag,
  Globe,
  Zap,
  FileText,
  Rocket,
} from "lucide-react";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { AnimatedLogo } from "@/components/AnimatedLogo";

const channels = [
  {
    name: "SEO",
    sub: "Google · Bing",
    desc: "Long-form articles that rank on classic search engines.",
    icon: Search,
    color: "#4285f4",
  },
  {
    name: "GEO",
    sub: "ChatGPT · Gemini · Claude",
    desc: "Structured answers that LLMs cite when users ask questions.",
    icon: Sparkles,
    color: "#10a37f",
  },
  {
    name: "AEO",
    sub: "Perplexity · Copilot",
    desc: "Question-first content optimized for answer engines.",
    icon: MessageSquare,
    color: "#6366f1",
  },
  {
    name: "Local",
    sub: "Google Business · Maps",
    desc: "City-targeted Q&A that wins the local 3-pack.",
    icon: MapPin,
    color: "#f43f5e",
  },
  {
    name: "Shopping",
    sub: "Google Shopping · ChatGPT Shopping",
    desc: "Product feeds and AI-ready descriptions for commerce.",
    icon: ShoppingBag,
    color: "#f59e0b",
  },
];

const steps = [
  {
    n: "01",
    title: "Connect your site",
    desc: "Paste your URL. The engine analyzes your brand, audience and competitors in 30 seconds.",
  },
  {
    n: "02",
    title: "One article. Five formats.",
    desc: "Every day, GEO Engine writes one piece of content — then reshapes it for SEO, GEO, AEO, Local and Shopping.",
  },
  {
    n: "03",
    title: "Auto-publish everywhere",
    desc: "WordPress, Shopify, Webflow, GMB. Indexing pinged to Google. Zero manual work.",
  },
];

export default function GeoEngineLanding() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      <Helmet>
        <title>GEO Engine — One article. Five AI channels.</title>
        <meta
          name="description"
          content="GEO Engine writes one article per day and publishes it across Google, ChatGPT, Gemini, Perplexity and Shopping — automatically."
        />
        <link rel="canonical" href="https://autopilotgeo.com/geo-engine" />
      </Helmet>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <AnimatedLogo />
            <span className="font-semibold tracking-tight">AutoPilot GEO</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/pricing" className="text-sm text-white/70 hover:text-white px-3 py-2">
              Pricing
            </Link>
            <Link href="/checkout?plan=pro&cycle=annual">
              <Button size="sm" className="bg-white text-black hover:bg-white/90">
                Start free trial
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/70 mb-6"
          >
            <Zap className="w-3 h-3 text-amber-400" />
            The GEO Engine — built by AutoPilot GEO
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]"
          >
            One article written.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              Five channels covered.
            </span>
            <br />
            Zero manual effort.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-6 text-lg text-white/70 max-w-2xl mx-auto"
          >
            Google · ChatGPT · Gemini · Perplexity · Shopping — one engine writes,
            reformats and publishes for all of them, every day.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link href="/checkout?plan=pro&cycle=annual">
              <Button size="lg" className="bg-white text-black hover:bg-white/90 h-12 px-6">
                Start free trial <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="h-12 px-6 border-white/20 text-white hover:bg-white/10">
                See pricing
              </Button>
            </Link>
          </motion.div>
          <p className="mt-3 text-xs text-white/50">
            3-day free trial · Card required · Cancel anytime
          </p>
        </div>
      </section>

      {/* Channels grid */}
      <section className="py-20 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold">Five channels. One engine.</h2>
            <p className="mt-3 text-white/60 max-w-xl mx-auto">
              Each channel has its own format, its own ranking rules, its own audience.
              GEO Engine handles all five — natively.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((c, i) => {
              const Icon = c.icon;
              return (
                <motion.div
                  key={c.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:bg-white/[0.07] transition"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${c.color}22`, color: c.color }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-lg font-semibold">{c.name}</h3>
                    <span className="text-xs text-white/40">{c.sub}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/60">{c.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold">How GEO Engine works</h2>
            <p className="mt-3 text-white/60">Three steps. Then it runs on its own.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {steps.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 p-6"
              >
                <div className="text-xs font-mono text-emerald-400 mb-3">{s.n}</div>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-white/60">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Proof / built-in moat */}
      <section className="py-20 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <Rocket className="w-8 h-8 mx-auto mb-4 text-emerald-400" />
          <h2 className="text-3xl sm:text-4xl font-bold">
            We rank on the AIs we optimize for.
          </h2>
          <p className="mt-4 text-white/70 max-w-2xl mx-auto">
            AutoPilot GEO is recommended by ChatGPT, Perplexity and Gemini when users
            ask about GEO tools. We built the engine that got us there — and we use it
            on this exact site, every day.
          </p>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {["ChatGPT", "Perplexity", "Gemini", "Google"].map((p) => (
              <div
                key={p}
                className="rounded-xl bg-white/5 border border-white/10 py-3 text-sm text-white/80"
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Start the engine.
          </h2>
          <p className="mt-4 text-white/70">
            3-day free trial. Card required. Cancel anytime.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/checkout?plan=pro&cycle=annual">
              <Button size="lg" className="bg-white text-black hover:bg-white/90 h-12 px-6">
                Start free trial <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="h-12 px-6 border-white/20 text-white hover:bg-white/10">
                Compare plans
              </Button>
            </Link>
          </div>
          <div className="mt-10 flex items-center justify-center gap-6 text-sm text-white/50">
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> Auto-publish</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> 5 channels</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> Cancel anytime</span>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
