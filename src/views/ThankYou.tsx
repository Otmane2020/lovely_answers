"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { trackPurchase } from "@/lib/gtag-conversions";
import { trackMetaPurchase } from "@/lib/meta-pixel";
import { supabase } from "@/integrations/supabase/client";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";

export default function ThankYou() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { checkSubscription } = useSubscriptionContext();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [postPaymentReady, setPostPaymentReady] = useState(false);
  const trackedRef = useRef(false);
  const sessionId = searchParams.get("session_id");
  const subscriptionId = searchParams.get("subscription_id");
  const setupIntent = searchParams.get("setup_intent");
  const redirectStatus = searchParams.get("redirect_status");

  // Force light theme
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    if (!sessionId && !subscriptionId) {
      router.replace("/checkout");
      return;
    }

    const verify = async () => {
      try {
        if (subscriptionId && redirectStatus && redirectStatus !== "succeeded") {
          setVerified(false);
          return;
        }

        if (subscriptionId && !setupIntent) {
          setVerified(false);
          return;
        }

        let data: any = null;
        if (sessionId) {
          const { data: verifyData, error } = await supabase.functions.invoke("verify-checkout-session", {
            body: { session_id: sessionId },
          });

          if (error || !verifyData?.paid) {
            console.warn("[ThankYou] Payment not verified:", error);
            setVerified(false);
            return;
          }
          data = verifyData;
        }

        // Trigger backend unlock immediately (verifies Stripe + unlocks articles/geo)
        try {
          await supabase.functions.invoke("verify-and-unlock-payment");
        } catch (e) {
          console.warn("[ThankYou] verify-and-unlock-payment failed:", e);
        }

        // Force-refresh subscription state with retries to overcome Stripe propagation lag.
        let activeConfirmed = false;
        for (let i = 0; i < 6; i++) {
          try {
            const active = await checkSubscription(subscriptionId || undefined);
            if (active) {
              activeConfirmed = true;
              setVerified(true);
              setPostPaymentReady(true);
              break;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, i < 2 ? 1500 : 2500));
        }

        if (!activeConfirmed) {
          const active = await checkSubscription(subscriptionId || undefined);
          if (!active) {
            setVerified(false);
            return;
          }
          setVerified(true);
          setPostPaymentReady(true);
        }

        if (!trackedRef.current) {
          trackedRef.current = true;
          const value = data?.amount ? data.amount / 100 : 29;
          const transactionId = sessionId || setupIntent || subscriptionId || undefined;
          trackPurchase(value, transactionId);
          // Second account purchase conversion (AW-17956394555)
          if (typeof window !== "undefined" && window.gtag) {
            window.gtag("event", "conversion", {
              send_to: "AW-17956394555/lC8cCNymrfkbELuso_JC",
              value: value,
              currency: "USD",
              transaction_id: transactionId || "",
            });
          }
          // Tapfiliate trial conversion
          if (typeof window !== "undefined" && (window as any).tap && data?.customer_id) {
            (window as any).tap("trial", data.customer_id);
            console.log("[ThankYou] Tapfiliate trial fired:", data.customer_id);
          }
          // Meta Pixel — Subscribe + Purchase conversion
          trackMetaPurchase(value, transactionId);
          console.log("[ThankYou] Purchase conversion fired (both accounts):", { value, transactionId });
        }
      } catch (err) {
        console.error("[ThankYou] Verification error:", err);
        setVerified(false);
      }
    };

    verify();
  }, [sessionId, subscriptionId, setupIntent, redirectStatus, router, checkSubscription]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="py-4 px-4 border-b border-border">
        <div className="container flex items-center justify-center">
          <Link href="/" className="flex items-center">
            <AnimatedLogo size="md" />
          </Link>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center space-y-8">
          {verified === null && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Verifying your payment...</p>
            </div>
          )}

          {verified === true && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Payment confirmed! 🎉
                </h1>
                <p className="text-muted-foreground text-lg">
                  {postPaymentReady ? "Your access is active and content generation has started." : "Welcome to AutoPilot Geo. Activating your access..."}
                </p>
              </div>
              <Button
                onClick={async () => {
                  // Final refresh right before navigation to ensure no stale lock state
                  try { await checkSubscription(); } catch {}
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    // Shopify OAuth users → onboarding wizard (with prefill from shop)
                    const { data: shopProj } = await supabase
                      .from("projects")
                      .select("id, needs_onboarding, source")
                      .eq("user_id", user.id)
                      .eq("needs_onboarding", true)
                      .maybeSingle();
                    if (shopProj?.needs_onboarding) {
                      router.push(shopProj.source === "shopify_oauth" ? "/wizard?source=shopify" : "/wizard");
                      return;
                    }
                    // Users without any project → wizard
                    const { data: projects } = await supabase
                      .from("projects").select("id").eq("user_id", user.id).limit(1);
                    if (!projects || projects.length === 0) {
                      router.push("/wizard");
                      return;
                    }
                  }
                  router.push("/dashboard");
                }}
                disabled={!postPaymentReady}
                className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-violet-500 hover:opacity-90 transition-opacity rounded-xl disabled:opacity-70"
              >
                {postPaymentReady ? "Continue setup" : "Unlocking your workspace..."}
                {postPaymentReady ? <ArrowRight className="h-5 w-5 ml-2" /> : <Loader2 className="h-5 w-5 ml-2 animate-spin" />}
              </Button>
            </>
          )}

          {verified === false && (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-foreground">
                  Something went wrong
                </h1>
                <p className="text-muted-foreground">
                  We couldn't verify your payment. If you were charged, please contact support.
                </p>
              </div>
              <Button
                onClick={() => router.push("/dashboard")}
                variant="outline"
                className="w-full h-12 rounded-xl"
              >
                Go to Dashboard
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
