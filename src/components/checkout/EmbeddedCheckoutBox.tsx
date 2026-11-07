"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { Appearance, StripeElementsOptions } from "@stripe/stripe-js";
import { Check, Loader2, Lock, Tag, X } from "lucide-react";
import { getStripe } from "@/lib/stripe-client";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  plan: "starter" | "pro" | "agency";
  cycle: "monthly" | "annual";
  onError?: (msg: string) => void;
}

const WELCOME_POPUP_KEY = "welcome_promo_popup_dismissed";

export function EmbeddedCheckoutBox({ plan, cycle, onError }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; label: string } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(WELCOME_POPUP_KEY)) {
      const t = setTimeout(() => setShowWelcome(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const init = useCallback(
    async (promo?: string) => {
      setLoading(true);
      setErrorMsg(null);
      setClientSecret(null);
      setSubscriptionId(null);
      try {
        const { data, error } = await supabase.functions.invoke(
          "create-subscription-setup",
          { body: { plan, cycle, promo_code: promo || undefined } }
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.client_secret) throw new Error("Missing client_secret");
        if (!data?.subscription_id) throw new Error("Missing subscription_id");
        setClientSecret(data.client_secret);
        setSubscriptionId(data.subscription_id);
        setAppliedPromo(data.promo ?? null);
      } catch (e: any) {
        const msg = e?.message || "Failed to start checkout";
        setErrorMsg(msg);
        onErrorRef.current?.(msg);
      } finally {
        setLoading(false);
      }
    },
    [plan, cycle]
  );

  useEffect(() => {
    init();
  }, [init]);

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoError(null);
    setPromoLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-subscription-setup",
        { body: { plan, cycle, promo_code: code } }
      );
      if (error) throw error;
      if (data?.invalid_promo) {
        setPromoError(data.error || "Invalid promo code");
        return;
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.client_secret) throw new Error("Could not apply code");
      setClientSecret(data.client_secret);
      setSubscriptionId(data.subscription_id);
      setAppliedPromo(data.promo ?? { code, label: "Discount applied" });
      setPromoInput("");
    } catch (e: any) {
      setPromoError(e?.message || "Invalid promo code");
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = async () => {
    setAppliedPromo(null);
    await init();
  };

  const useWelcome = async () => {
    setShowWelcome(false);
    localStorage.setItem(WELCOME_POPUP_KEY, "1");
    setPromoInput("WELCOME10");
    setPromoLoading(true);
    setPromoError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-subscription-setup",
        { body: { plan, cycle, promo_code: "WELCOME10" } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setClientSecret(data.client_secret);
      setSubscriptionId(data.subscription_id);
      setAppliedPromo(data.promo ?? { code: "WELCOME10", label: "10% off" });
      setPromoInput("");
    } catch (e: any) {
      setPromoError(e?.message || "Failed to apply WELCOME10");
    } finally {
      setPromoLoading(false);
    }
  };

  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem(WELCOME_POPUP_KEY, "1");
  };

  const appearance = useMemo<Appearance>(
    () => ({
      theme: "stripe",
      variables: {
        colorPrimary: "#6366f1",
        colorBackground: "#ffffff",
        colorText: "#0f172a",
        colorDanger: "#ef4444",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        spacingUnit: "4px",
        borderRadius: "12px",
      },
      rules: {
        ".Input": {
          border: "1px solid hsl(214 32% 91%)",
          boxShadow: "none",
          padding: "12px",
        },
        ".Input:focus": {
          border: "1px solid #6366f1",
          boxShadow: "0 0 0 3px rgba(99,102,241,0.15)",
        },
        ".Label": { fontWeight: "500", fontSize: "13px", color: "#475569" },
        ".Tab, .Block": { borderRadius: "12px" },
      },
    }),
    []
  );

  const options = useMemo<StripeElementsOptions | null>(
    () => (clientSecret ? { clientSecret, appearance, loader: "auto" } : null),
    [clientSecret, appearance]
  );

  return (
    <>
      {showWelcome && (
        <WelcomePromoModal
          onApply={useWelcome}
          onClose={dismissWelcome}
          loading={promoLoading}
        />
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-background flex items-center justify-center h-[420px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : errorMsg || !options || !subscriptionId ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {errorMsg || "Unable to load payment form."}
          <Button variant="outline" size="sm" className="mt-3" onClick={() => init()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-background p-5 space-y-4">
          {/* Promo code block */}
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
            {appliedPromo ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                    <Check className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold">{appliedPromo.code}</div>
                    <div className="text-xs text-muted-foreground">{appliedPromo.label}</div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removePromo}
                  className="text-xs"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" /> Promo code
                </label>
                <div className="flex gap-2">
                  <Input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    placeholder="e.g. WELCOME10"
                    className="h-10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyPromo();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyPromo}
                    disabled={promoLoading || !promoInput.trim()}
                    className="h-10"
                  >
                    {promoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
                {promoError && (
                  <p className="text-xs text-destructive">{promoError}</p>
                )}
              </div>
            )}
          </div>

          <Elements stripe={getStripe()} options={options} key={clientSecret!}>
            <InnerForm subscriptionId={subscriptionId} />
          </Elements>
        </div>
      )}
    </>
  );
}

function WelcomePromoModal({
  onApply,
  onClose,
  loading,
}: {
  onApply: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="relative w-full max-w-sm rounded-2xl bg-gradient-to-br from-primary to-violet-600 p-6 text-white shadow-2xl animate-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white/70 hover:text-white transition"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-5xl mb-2">🎁</div>
        <h3 className="text-2xl font-bold mb-1">Welcome gift</h3>
        <p className="text-white/90 text-sm mb-4">
          Get <span className="font-bold">10% off</span> your subscription with code{" "}
          <span className="font-mono bg-white/20 px-2 py-0.5 rounded">WELCOME10</span>
        </p>
        <Button
          onClick={onApply}
          disabled={loading}
          className="w-full bg-white text-primary hover:bg-white/90 font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Applying...
            </>
          ) : (
            "Apply 10% off"
          )}
        </Button>
        <button
          onClick={onClose}
          className="w-full text-center text-xs text-white/70 hover:text-white mt-3"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

function InnerForm({ subscriptionId }: { subscriptionId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/thank-you?subscription_id=${encodeURIComponent(subscriptionId)}`,
      },
    });
    if (err) {
      setError(err.message || "Payment failed");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-violet-500 hover:opacity-90 rounded-xl"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="h-4 w-4 mr-2" />
            Start 3-day free trial
          </>
        )}
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        No charge today. Cancel anytime before day 4.
      </p>
    </form>
  );
}
