"use client";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { AnimatedLogo } from "@/components/AnimatedLogo";

export default function Terms() {
  return (
    <>
      <Helmet>
        <title>Terms of Service - AutoPilot Geo</title>
        <meta name="description" content="Read the Terms of Service for AutoPilot Geo AEO platform." />
        <link rel="canonical" href="https://autopilotgeo.com/terms" />
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

        {/* Hero bar */}
        <div className="bg-[hsl(222,47%,11%)] pt-28 pb-12">
          <div className="container max-w-3xl">
            <h1 className="text-4xl font-bold text-white">Terms of Service</h1>
            <p className="text-white/40 mt-2">Last updated: January 2026</p>
          </div>
        </div>

        {/* Content */}
        <main className="bg-white py-16">
          <div className="container max-w-3xl">
            <div className="space-y-8 text-gray-500">
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">1. Agreement to Terms</h2>
                <p>By accessing or using AutoPilot Geo's services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.</p>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">2. Description of Service</h2>
                <p>AutoPilot Geo provides Answer Engine Optimization (AEO) services, including AI-generated content, SEO optimization, and content publishing tools.</p>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">3. Subscription and Payment</h2>
                <p>We offer a 3-day free trial for new users. After the trial period, you will be charged according to the subscription plan you selected.</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Subscriptions are billed monthly</li>
                  <li>You may cancel your subscription at any time</li>
                  <li>No refunds are provided after the trial period due to API and AI service costs</li>
                </ul>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">4. Content Ownership</h2>
                <p>All content generated through our platform belongs to you. You retain full rights to use, modify, and distribute the content as you see fit.</p>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">5. Acceptable Use</h2>
                <p>You agree not to use our services to generate content that is illegal, harmful, or violates third-party rights.</p>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">6. Contact</h2>
                <p>For any questions regarding these terms, please contact us at <a href="mailto:support@autopilotgeo.com" className="text-violet-600 hover:underline">support@autopilotgeo.com</a></p>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">7. Company Information</h2>
                <p>AutoPilot Geo Ltd — Contact: <a href="mailto:support@autopilotgeo.com" className="text-violet-600 hover:underline">support@autopilotgeo.com</a></p>
              </section>
            </div>
          </div>
        </main>

        <PublicFooter />
      </div>
    </>
  );
}
