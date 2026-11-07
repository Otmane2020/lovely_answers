"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Zap, Globe2, FileText, ArrowRight, Check } from "lucide-react";

const SUPABASE_URL = "https://pnohfokjlhpzrkczruju.supabase.co";

const perks = [
  { icon: <Zap className="h-4 w-4" />, label: "1-click OAuth install" },
  { icon: <ShoppingBag className="h-4 w-4" />, label: "Auto-import all your products" },
  { icon: <Globe2 className="h-4 w-4" />, label: "Content in your shop's language" },
  { icon: <FileText className="h-4 w-4" />, label: "Auto-publish articles daily to your Shopify blog" },
];

export function ShopifyIntegrationSection() {
  const [shop, setShop] = useState("");

  const install = () => {
    let s = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (s && !s.endsWith(".myshopify.com")) s = `${s}.myshopify.com`;
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) {
      alert("Enter a valid shop like your-store.myshopify.com");
      return;
    }
    window.location.href = `${SUPABASE_URL}/functions/v1/shopify-oauth-install?shop=${encodeURIComponent(s)}`;
  };

  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-white to-[#f8f7f4]">
      <div className="container px-4">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-5xl"
        >
          <div className="rounded-3xl border border-[#e8e6df] bg-white overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.04)]">
            <div className="grid md:grid-cols-2 gap-0">
              {/* Left: pitch */}
              <div className="p-8 md:p-12">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#96bf48]/10 border border-[#96bf48]/30 px-3 py-1 text-xs font-semibold text-[#5c8a1f]">
                  {/* Shopify official mark */}
                  <svg viewBox="0 0 109 124" className="h-4 w-4" aria-hidden="true">
                    <path fill="#95BF47" d="M74.7 14.8c0-.4-.3-.6-.6-.7-.3 0-5.3-.3-5.3-.3s-4.2-4.2-4.7-4.6c-.4-.4-1.3-.3-1.6-.2 0 0-.9.3-2.3.7-1.4-4-3.9-7.7-8.2-7.7h-.4c-1.2-1.6-2.7-2.3-4-2.3-10.1 0-15 12.7-16.5 19.1-3.9 1.2-6.7 2.1-7 2.2-2.2.7-2.3.8-2.6 2.9C21.3 25.7 15.7 68.3 15.7 68.3l43.7 8.2 23.7-5.1S74.7 15.2 74.7 14.8zM55.4 8.6c-1 .3-2.1.7-3.3 1v-.7c0-2.2-.3-4-.8-5.4 2 .3 3.4 2.5 4.1 5.1zm-6.6-4.7c.5 1.4.9 3.4.9 6v.4c-2.1.7-4.4 1.4-6.7 2.1C43.4 8.6 45.8 5 48.8 3.9zm-2.7-2.6c.5 0 1 .2 1.5.5-3.9 1.8-8 6.4-9.7 15.5-1.8.6-3.6 1.1-5.3 1.7 1.9-6.4 6.1-17.7 13.5-17.7z"/>
                    <path fill="#5E8E3E" d="M74.1 14.1c-.3 0-5.3-.3-5.3-.3s-4.2-4.2-4.7-4.6c-.2-.2-.4-.3-.6-.3v67.5l23.7-5.1S74.7 15.2 74.7 14.8c-.1-.4-.3-.6-.6-.7z"/>
                    <path fill="#fff" d="M48.9 30.7l-2.9 8.7s-2.6-1.4-5.7-1.4c-4.6 0-4.8 2.9-4.8 3.6 0 4 10.4 5.5 10.4 14.8 0 7.4-4.7 12.1-11 12.1-7.5 0-11.3-4.7-11.3-4.7l2-6.7s3.9 3.4 7.3 3.4c2.2 0 3.1-1.7 3.1-3 0-5.2-8.5-5.5-8.5-14 0-7.2 5.2-14.2 15.6-14.2 4 0 5.8 1.4 5.8 1.4z"/>
                  </svg>
                  GEO Shopping for Shopify
                </div>
                <h2 className="mt-4 text-3xl md:text-4xl font-bold text-gray-900 leading-tight">
                  Turn your Shopify store into an AI‑citation machine.
                </h2>
                <p className="mt-4 text-gray-600 text-lg leading-relaxed">
                  Install our Shopify app in one click. We import your products, detect your shop's language and
                  automatically generate optimized articles that get cited by ChatGPT, Gemini and Perplexity —
                  and publish them directly to your Shopify blog.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {perks.map((p) => (
                    <li key={p.label} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      {p.label}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right: install box */}
              <div className="p-8 md:p-12 bg-gradient-to-br from-[#f5faf0] to-[#e8f4de] border-l border-[#e8e6df] flex flex-col justify-center">
                <div className="rounded-2xl bg-white border border-[#d9e8c9] p-6 shadow-sm">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Your Shopify store URL
                  </label>
                  <div className="mt-2 flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#96bf48]/40">
                    <Input
                      value={shop}
                      onChange={(e) => setShop(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && install()}
                      placeholder="your-store"
                      className="border-0 focus-visible:ring-0 h-11"
                    />
                    <span className="pr-3 text-sm text-gray-400 whitespace-nowrap">.myshopify.com</span>
                  </div>
                  <Button
                    onClick={install}
                    className="mt-3 w-full h-12 bg-[#5c8a1f] hover:bg-[#4a7018] text-white font-semibold rounded-xl"
                  >
                    Install on Shopify
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                  <p className="mt-3 text-xs text-gray-500 text-center">
                    Free 3-day trial · Cancel anytime · No credit card until day 4
                  </p>
                </div>
                <p className="mt-4 text-xs text-gray-500 text-center">
                  Already using AutoPilot Geo?{" "}
                  <a href="/dashboard" className="text-[#5c8a1f] font-semibold hover:underline">
                    Open the app →
                  </a>
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
