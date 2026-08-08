"use client";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Target, Users, Zap } from "lucide-react";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { AnimatedLogo } from "@/components/AnimatedLogo";

const aboutStructuredData = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "mainEntity": {
    "@type": "Organization",
    "name": "AutoPilot Geo",
    "description": "Pioneering Answer Engine Optimization to help businesses thrive in the AI-first era.",
    "url": "https://autopilotgeo.com",
    "numberOfEmployees": { "@type": "QuantitativeValue", "value": "10-50" }
  }
};

export default function About() {
  return (
    <>
      <Helmet>
        <title>About AutoPilot Geo – AEO Platform</title>
        <meta name="description" content="Learn about AutoPilot Geo, the AEO platform helping 500+ businesses get cited by ChatGPT, Gemini, and AI assistants." />
        <link rel="canonical" href="https://autopilotgeo.com/about" />
        <meta property="og:title" content="About AutoPilot Geo" />
        <meta property="og:description" content="The AEO platform helping 500+ businesses get cited by ChatGPT, Gemini, and AI assistants." />
        <meta property="og:url" content="https://autopilotgeo.com/about" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(aboutStructuredData)}</script>
      </Helmet>

      <div className="min-h-screen">
        {/* Navigation */}
        <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-[hsl(222,47%,11%)]/90 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center">
              <AnimatedLogo size="md" />
            </Link>
            <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10" asChild>
              <Link href="/"><ArrowLeft className="h-4 w-4 mr-2" />Back to Home</Link>
            </Button>
          </div>
        </nav>

        {/* Hero - Dark */}
        <section className="relative overflow-hidden pt-32 pb-20 bg-[hsl(222,47%,11%)]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-[150px]" />
          <div className="container relative max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-6 text-white">
              About <span className="text-violet-400">AutoPilot Geo</span>
            </h1>
            <p className="text-xl text-white/50">
              Pioneering Answer Engine Optimization to help businesses thrive in the AI-first era.
            </p>
          </div>
        </section>

        {/* Mission - White */}
        <section className="py-20 bg-white">
          <div className="container max-w-4xl">
            <div className="grid gap-8 md:grid-cols-3">
              {[
                { icon: Target, title: "Our Mission", desc: "Make every business discoverable by AI assistants and search engines." },
                { icon: Zap, title: "Our Technology", desc: "AI-powered content generation optimized for LLM understanding and citation." },
                { icon: Users, title: "Our Clients", desc: "500+ businesses trust AutoPilot Geo for their AI visibility strategy." },
              ].map((item, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 p-6 text-center">
                  <div className="mb-4 mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(222,47%,11%)]">
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2 text-[hsl(222,47%,11%)]">{item.title}</h2>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Story */}
        <section className="py-20 bg-gray-50">
          <div className="container max-w-3xl">
            <h2 className="text-3xl font-bold mb-8 text-center text-[hsl(222,47%,11%)]">Our Story</h2>
            <div className="space-y-6 text-gray-500">
              <p>AutoPilot Geo was founded with a simple observation: the way people find information is changing. With the rise of AI assistants like ChatGPT, Gemini, and Perplexity, traditional SEO alone is no longer enough to ensure your business gets discovered.</p>
              <p>We developed Answer Engine Optimization (AEO) - a new approach that makes your content not just searchable, but citable by AI systems. Our platform helps businesses create structured, authoritative content that AI assistants trust and recommend.</p>
              <p>Our distributed team combines expertise in AI, SEO, and content marketing to deliver a comprehensive solution for the AI-first era.</p>
            </div>
          </div>
        </section>

        {/* CTA - Dark */}
        <section className="py-20 bg-[hsl(222,47%,11%)]">
          <div className="container max-w-2xl text-center">
            <h2 className="text-3xl font-bold mb-4 text-white">Ready to Get Started?</h2>
            <p className="text-white/50 mb-8">Join 500+ businesses already using AutoPilot Geo to dominate AI search.</p>
            <Button className="gap-2 bg-white text-[hsl(222,47%,11%)] hover:bg-white/90" size="lg" asChild>
              <Link href="/auth">Start Free Trial <ArrowRight className="h-5 w-5" /></Link>
            </Button>
          </div>
        </section>

        {/* Company Info */}
        <section className="py-20 bg-white">
          <div className="container max-w-3xl text-center">
            <h2 className="text-2xl font-bold mb-6 text-[hsl(222,47%,11%)]">Company Information</h2>
            <div className="text-gray-500">
               <p className="font-medium text-[hsl(222,47%,11%)]">AutoPilot Geo Ltd</p>
              <p className="mt-4"><a href="mailto:support@autopilotgeo.com" className="text-violet-600 hover:underline">support@autopilotgeo.com</a></p>
            </div>
          </div>
        </section>

        <PublicFooter />
      </div>
    </>
  );
}
