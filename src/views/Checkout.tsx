"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { trackCheckoutStart } from "@/lib/gtag-conversions";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Shield, LogOut, Star, CheckCircle2, Lock } from "lucide-react";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { cn } from "@/lib/utils";
import { PLANS, type BillingCycle, type PlanId, formatUSD } from "@/lib/stripe-products";
import { EmbeddedCheckoutBox } from "@/components/checkout/EmbeddedCheckoutBox";
import { ProjectSwitcher } from "@/components/layout/ProjectSwitcher";


export default function Checkout() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSubscribed, isTrial, isLoading: subLoading } = useSubscriptionContext();
  const [isLoading, setIsLoading] = useState(false);
  const [showCard, setShowCard] = useState(false);


  // Read plan + cycle from URL, default to Pro / annual
  const planParam = (searchParams?.get("plan") as PlanId) || "pro";
  const cycleParam = (searchParams?.get("cycle") as BillingCycle) || "annual";
  const [planId, setPlanId] = useState<PlanId>(
    PLANS[planParam] ? planParam : "pro"
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    cycleParam === "monthly" || cycleParam === "annual" ? cycleParam : "annual"
  );

  const plan = PLANS[planId];
  const priceInfo = plan.prices[billingCycle];

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    if (!subLoading && (isSubscribed || isTrial)) {
      router.replace("/dashboard");
    }
  }, [isSubscribed, isTrial, subLoading, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  const handleStart = async () => {
    setIsLoading(true);
    trackCheckoutStart(billingCycle, priceInfo.amount / 100);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        const next = `/checkout?plan=${planId}&cycle=${billingCycle}`;
        router.push(`/auth?mode=signup&next=${encodeURIComponent(next)}`);
        return;
      }
      // Reveal embedded Stripe checkout in-page (no redirect)
      setShowCard(true);
    } catch (err) {
      console.error("Checkout failed:", err);
      toast({ title: "Error", description: "Failed to start checkout. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };



  if (subLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Checking subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="py-4 px-4 border-b border-border">
        <div className="container flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center"><AnimatedLogo size="md" /></Link>
          <div className="flex items-center gap-2">
            <ProjectSwitcher />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Start your 3-day free trial</h1>
            <p className="text-muted-foreground">No charge until day 4 · Cancel anytime in 1 click</p>
          </div>

          {/* Plan selector — 3 tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-muted">
            {(Object.values(PLANS)).map((p) => (
              <button
                key={p.id}
                onClick={() => setPlanId(p.id)}
                className={cn(
                  "py-2 rounded-lg text-sm font-semibold transition-all",
                  planId === p.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Cycle */}
          <div className="space-y-3">
            <button
              onClick={() => setBillingCycle("annual")}
              className={cn(
                "w-full p-5 rounded-2xl border-2 text-left transition-all relative",
                billingCycle === "annual"
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                  : "border-border hover:border-muted-foreground/50"
              )}
            >
              <div className="absolute -top-3 left-4">
                <span className="bg-emerald-500 text-white text-xs font-semibold px-3 py-1 rounded-full">Save 20%</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">{formatUSD(plan.prices.annual.perMonth)}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Billed {formatUSD(plan.prices.annual.amount)} /year</p>
                </div>
                <Dot active={billingCycle === "annual"} />
              </div>
            </button>

            <button
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "w-full p-5 rounded-2xl border-2 text-left transition-all",
                billingCycle === "monthly"
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                  : "border-border hover:border-muted-foreground/50"
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">{formatUSD(plan.prices.monthly.perMonth)}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Billed monthly</p>
                </div>
                <Dot active={billingCycle === "monthly"} />
              </div>
            </button>
          </div>

          {!showCard ? (
            <Button
              onClick={handleStart}
              disabled={isLoading}
              className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-violet-500 hover:opacity-90 transition-opacity rounded-xl"
            >
              {isLoading ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading secure checkout...</>
              ) : (
                <>Start 3 days free <ArrowRight className="h-5 w-5 ml-2" /></>
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Lock className="h-4 w-4 text-primary" />
                Enter your card — no charge during your 3-day trial.
              </div>
              <EmbeddedCheckoutBox
                plan={planId}
                cycle={billingCycle}
                onError={(msg) =>
                  toast({ title: "Checkout error", description: msg, variant: "destructive" })
                }
              />
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-primary" />
            <span>Secure payment by Stripe · No charge during trial</span>
          </div>


          <a
            href="https://trust-avis.com/entreprise/autopilotgeo"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 py-3 px-5 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-colors mx-auto"
          >
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (<Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />))}
            </div>
            <div className="text-sm">
              <span className="font-semibold text-foreground">4.9</span>
              <span className="text-muted-foreground"> · 289 reviews</span>
            </div>
            <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">Excellent</span>
          </a>

          <div className="pt-4 border-t border-border">
            <p className="text-sm font-semibold text-foreground mb-3">Included with {plan.name}:</p>
            <ul className="space-y-2.5">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot({ active }: { active: boolean }) {
  return (
    <div className={cn(
      "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
      active ? "border-primary bg-primary" : "border-muted-foreground/30"
    )}>
      {active && <div className="w-2 h-2 rounded-full bg-white" />}
    </div>
  );
}
