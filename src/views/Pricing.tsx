"use client";
import { useEffect, useState } from "react";
import { trackPricingView } from "@/lib/gtag-conversions";
import { trackMetaPricingView } from "@/lib/meta-pixel";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Check, Shield, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { SocialProofToast } from "@/components/nudges/SocialProofToast";
import { ExitIntentPopup } from "@/components/nudges/ExitIntentPopup";
import { PLANS, type BillingCycle, type PlanId, formatUSD } from "@/lib/stripe-products";
import { cn } from "@/lib/utils";

const pricingStructuredData = {
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "AutoPilot GEO — AEO Platform",
  "description": "Get cited by ChatGPT, Gemini and Perplexity. 3-day free trial. Starter $49, Pro $99, Agency $199.",
  "image": "https://autopilotgeo.com/og-pricing.png",
  "brand": { "@type": "Brand", "name": "AutoPilot GEO" },
  "offers": [
    { "@type": "Offer", "name": "Starter", "price": "49", "priceCurrency": "USD" },
    { "@type": "Offer", "name": "Pro",     "price": "99", "priceCurrency": "USD" },
    { "@type": "Offer", "name": "Agency",  "price": "199","priceCurrency": "USD" },
  ],
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "289", "bestRating": "5" }
};

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [] as Array<{ "@type": "Question"; name: string; acceptedAnswer: { "@type": "Answer"; text: string } }>,
};

const faqs = [
  { question: "How does the 3-day free trial work?", answer: "Enter your card to start. You get full access for 3 days. We email you the day before charging. Cancel anytime in 1 click — no charge if you cancel before day 4." },
  { question: "I'm not an SEO expert — can I still use this?", answer: "Yes. AutoPilot GEO is built for founders, not SEO consultants. Type your domain, we handle keyword research, content, and publishing." },
  { question: "Will Google penalize AI content?", answer: "No. Google's official position: quality content is welcome regardless of how it's produced. Our articles are written for humans first, AI second." },
  { question: "Which CMS do you support?", answer: "WordPress, Shopify, Webflow, Wix, BigCommerce, Ghost, and any platform with a REST API." },
  { question: "How fast do I see results?", answer: "AEO visibility (ChatGPT mentions) usually within 30 days. Google ranking improvements typically 60-90 days." },
  { question: "Can I cancel anytime?", answer: "Yes. One click in your billing page. No phone calls, no retention scripts." },
];

faqStructuredData.mainEntity = faqs.map(f => ({
  "@type": "Question",
  name: f.question,
  acceptedAnswer: { "@type": "Answer", text: f.answer },
}));

export default function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  useEffect(() => { document.documentElement.classList.remove("dark"); trackPricingView(); trackMetaPricingView(); }, []);

  return (
    <>
      <SocialProofToast />
      <ExitIntentPopup ctaUrl="/checkout?plan=pro&cycle=annual" headline="🎁 3 days free on Pro" description="Cancel anytime before day 4 — no charge. Start ranking in ChatGPT today." ctaLabel="Start free trial" />
      <Helmet>
        <title>Pricing — AutoPilot GEO | $49, $99, $199 plans</title>
        <meta name="description" content="3 simple plans: Starter $49, Pro $99, Agency $199. 3-day free trial, cancel anytime. Get cited by ChatGPT, Gemini and Perplexity." />
        <link rel="canonical" href="https://autopilotgeo.com/pricing" />
        <meta property="og:title" content="Pricing — AutoPilot GEO" />
        <meta property="og:description" content="Starter $49, Pro $99, Agency $199. 3-day free trial. Get cited by ChatGPT, Gemini and Perplexity." />
        <meta property="og:url" content="https://autopilotgeo.com/pricing" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(pricingStructuredData)}</script>
        <script type="application/ld+json">{JSON.stringify(faqStructuredData)}</script>
      </Helmet>

      <div className="min-h-screen bg-white text-gray-900">
        <nav className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/90 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center"><AnimatedLogo size="md" /></Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <Button variant="ghost" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100" asChild><Link href="/">Home</Link></Button>
              <Button variant="ghost" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100" asChild><Link href="/auth">Sign In</Link></Button>
              <Button className="bg-gray-900 text-white hover:bg-gray-800 rounded-xl" asChild>
                <Link href="/checkout?plan=pro&cycle=annual">Start free <ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className="relative overflow-hidden pt-32 pb-12" style={{ background: "linear-gradient(180deg, #ffffff 0%, #f8f7f4 100%)" }}>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.06) 0%, transparent 70%)" }}
          />
          <div className="container relative">
            <div className="mx-auto max-w-3xl text-center">
              <Badge className="mb-6 bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-50">3-day free trial · Card required · Cancel anytime</Badge>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl text-gray-900" style={{ letterSpacing: "-0.02em" }}>
                Get cited by <span className="text-blue-600">ChatGPT</span> in 30 days
              </h1>
              <p className="mt-6 text-xl text-gray-500 max-w-2xl mx-auto">
                Simple pricing. No setup fees. No long-term commitment. Just AI visibility.
              </p>

              {/* Billing toggle */}
              <div className="mt-10 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                <button
                  onClick={() => setCycle("monthly")}
                  className={cn(
                    "px-5 py-2 rounded-full text-sm font-medium transition",
                    cycle === "monthly" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                  )}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setCycle("annual")}
                  className={cn(
                    "px-5 py-2 rounded-full text-sm font-medium transition flex items-center gap-2",
                    cycle === "annual" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                  )}
                >
                  Annual
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">−20%</span>
                </button>
              </div>
            </div>

            {/* PLAN CARDS */}
            <div className="mt-14 grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
              {(Object.values(PLANS) as typeof PLANS[PlanId][]).map((plan) => {
                const price = plan.prices[cycle];
                const isPopular = plan.popular;
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative rounded-2xl border p-7 flex flex-col bg-white transition-all",
                      isPopular
                        ? "border-blue-300 shadow-2xl shadow-blue-500/10 md:scale-[1.03] ring-1 ring-blue-200"
                        : "border-gray-100 shadow-sm hover:border-gray-200 hover:shadow-md"
                    )}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                          <Sparkles className="h-3 w-3" /> Most popular
                        </span>
                      </div>
                    )}
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                      <p className="mt-2 text-sm text-gray-500">{plan.tagline}</p>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-bold text-gray-900">{formatUSD(price.perMonth)}</span>
                        <span className="text-gray-600 text-sm">/mo</span>
                      </div>
                      {cycle === "annual" ? (
                        <p className="mt-1 text-xs text-gray-600">Billed {formatUSD(price.amount)} /year</p>
                      ) : (
                        <p className="mt-1 text-xs text-gray-600">Billed monthly · Cancel anytime</p>
                      )}
                    </div>

                    <Button
                      className={cn(
                        "mt-6 w-full rounded-xl",
                        isPopular
                          ? "bg-blue-600 hover:bg-blue-500 text-white"
                          : "bg-gray-900 hover:bg-gray-800 text-white"
                      )}
                      asChild
                    >
                      <Link href={`/checkout?plan=${plan.id}&cycle=${cycle}`}>
                        Start 3 days free <ArrowRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>

                    <ul className="mt-7 space-y-3 flex-1">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                          <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-500">
              <Shield className="h-4 w-4" /> Card required · No charge during trial · Cancel in 1 click
            </div>
          </div>
        </section>


        {/* FAQ */}
        <section className="py-20 bg-white">
          <div className="container max-w-3xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4 text-[hsl(222,47%,11%)]">FAQs</h2>
              <p className="text-gray-500">
                Question we missed?{" "}
                <a href="mailto:support@autopilotgeo.com" className="text-violet-600 hover:underline">Email us</a>
              </p>
            </div>
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border rounded-lg px-4 bg-gray-50">
                  <AccordionTrigger className="text-left hover:no-underline text-[hsl(222,47%,11%)]">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-gray-500">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
        <PublicFooter />
      </div>
    </>
  );
}
