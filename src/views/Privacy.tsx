"use client";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { AnimatedLogo } from "@/components/AnimatedLogo";

export default function Privacy() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy - AutoPilot Geo</title>
        <meta name="description" content="Learn how AutoPilot Geo protects your data. Our privacy policy covers data collection, security, GDPR compliance, and your rights." />
        <link rel="canonical" href="https://autopilotgeo.com/privacy" />
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
            <h1 className="text-4xl font-bold text-white">Privacy Policy</h1>
            <p className="text-white/40 mt-2">Last updated: January 2026</p>
          </div>
        </div>

        {/* Content */}
        <main className="bg-white py-16">
          <div className="container max-w-3xl">
            <div className="space-y-8 text-gray-500">
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">1. Information We Collect</h2>
                <p>We collect information you provide directly to us, including:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Account information (email, name, password)</li>
                  <li>Business information (website URL, business description)</li>
                  <li>Payment information (processed securely by Stripe)</li>
                  <li>Content you create using our services</li>
                </ul>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">2. How We Use Your Information</h2>
                <p>We use the information we collect to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide and improve our services</li>
                  <li>Generate personalized content for your business</li>
                  <li>Process payments and manage subscriptions</li>
                  <li>Send service updates and marketing communications</li>
                  <li>Respond to your inquiries and support requests</li>
                </ul>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">3. Data Security</h2>
                <p>We implement industry-standard security measures to protect your data. All payment processing is handled by Stripe, a PCI-compliant payment processor. Your data is encrypted in transit and at rest.</p>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">4. Data Sharing</h2>
                <p>We do not sell your personal information. We may share data with:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Service providers who help us operate our platform</li>
                  <li>Payment processors (Stripe) for transaction processing</li>
                  <li>Legal authorities when required by law</li>
                </ul>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">5. Your Rights</h2>
                <p>You have the right to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Access your personal data</li>
                  <li>Correct inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Export your data</li>
                  <li>Opt out of marketing communications</li>
                </ul>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">6. Cookies</h2>
                <p>We use cookies and similar technologies to enhance your experience, analyze site usage, and assist in our marketing efforts.</p>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">7. Contact</h2>
                <p>For privacy inquiries, contact us at <a href="mailto:support@autopilotgeo.com" className="text-violet-600 hover:underline">support@autopilotgeo.com</a></p>
              </section>
              <section className="space-y-3">
                <h2 className="text-2xl font-semibold text-[hsl(222,47%,11%)]">8. Company Information</h2>
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
