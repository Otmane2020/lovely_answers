"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { capsForPlan, normalizeLimit, type PlanFeatures } from "@/lib/stripe-products";

type PlanId = "starter" | "pro" | "agency" | null;
type Cycle = "monthly" | "annual" | null;

interface SubscriptionContextType {
  isSubscribed: boolean;
  isTrial: boolean;
  isLoading: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  creditsTotal: number;
  plan: PlanId;
  cycle: Cycle;
  sitesLimit: number | null;
  articlesLimit: number | null;
  features: PlanFeatures;
  checkSubscription: (subscriptionId?: string) => Promise<boolean>;
  startCheckout: () => Promise<string | null>;
  openCustomerPortal: () => Promise<string | null>;
}


const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [productId, setProductId] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [creditsTotal, setCreditsTotal] = useState(0);
  const [plan, setPlan] = useState<PlanId>(null);
  const [cycle, setCycle] = useState<Cycle>(null);
  const [sitesLimit, setSitesLimit] = useState<number | null>(null);
  const [articlesLimit, setArticlesLimit] = useState<number | null>(null);
  const [features, setFeatures] = useState<PlanFeatures>(capsForPlan(null));


  const checkSubscription = useCallback(async (subscriptionId?: string) => {
    // Don't check if auth is still loading
    if (authLoading) {
      return false;
    }

    if (!user) {
      setIsSubscribed(false);
      setIsTrial(false);
      setProductId(null);
      setSubscriptionEnd(null);
      setCreditsTotal(0);
      setIsLoading(false);
      return false;
    }

    try {
      console.log("[SubscriptionContext] Checking subscription for user:", user.email);
      const { data, error } = await supabase.functions.invoke(
        "check-subscription",
        subscriptionId ? { body: { subscription_id: subscriptionId } } : undefined
      );
      
      if (error) {
        console.error("[SubscriptionContext] Error checking subscription:", error);
        setIsLoading(false);
        return false;
      }

      console.log("[SubscriptionContext] Subscription response:", data);
      
      const subscribed = data?.subscribed || false;
      const trial = data?.trial || false;
      
      setIsSubscribed(subscribed);
      setIsTrial(trial);
      setProductId(data?.product_id || null);
      setSubscriptionEnd(data?.subscription_end || null);
      setCreditsTotal(data?.credits_total || 0);
      const planVal = (data?.plan as PlanId) ?? null;
      setPlan(planVal);
      setCycle((data?.cycle as Cycle) ?? null);
      setSitesLimit(normalizeLimit(data?.sites_limit));
      setArticlesLimit(normalizeLimit(data?.articles_limit));
      setFeatures(
        data?.features && typeof data.features === "object"
          ? { ...capsForPlan(planVal), ...data.features }
          : capsForPlan(planVal)
      );

      
      console.log("[SubscriptionContext] State set - subscribed:", subscribed, "trial:", trial);
      return subscribed || trial;
    } catch (err) {
      console.error("[SubscriptionContext] Subscription check failed:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, authLoading]);

  const startCheckout = async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout");
      
      if (error) {
        console.error("Checkout error:", error);
        return null;
      }

      return data?.url || null;
    } catch (err) {
      console.error("Checkout failed:", err);
      return null;
    }
  };

  const openCustomerPortal = async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");

      if (error) {
        console.error("Portal error:", error);
        return null;
      }

      return data?.url || null;
    } catch (err) {
      console.error("Portal failed:", err);
      return null;
    }
  };

  // Check on mount and when auth finishes loading
  useEffect(() => {
    // Only check when auth is done loading
    if (!authLoading) {
      checkSubscription();
    }
  }, [checkSubscription, authLoading]);

  // Handle success redirect - immediately recheck subscription
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      // Immediate recheck for subscription status
      checkSubscription();
    }
  }, [checkSubscription]);

  // Periodic refresh — fast (15s) while unsubscribed to catch new payments quickly,
  // then slow (60s) once subscribed.
  useEffect(() => {
    if (!user) return;
    const intervalMs = isSubscribed ? 60000 : 15000;
    const interval = setInterval(checkSubscription, intervalMs);
    return () => clearInterval(interval);
  }, [user, checkSubscription, isSubscribed]);

  return (
    <SubscriptionContext.Provider value={{ 
      isSubscribed, 
      isTrial, 
      isLoading, 
      productId,
      subscriptionEnd, 
      creditsTotal,
      plan,
      cycle,
      sitesLimit,
      articlesLimit,
      features,

      checkSubscription,
      startCheckout,
      openCustomerPortal 
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionContext() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error("useSubscriptionContext must be used within a SubscriptionProvider");
  }
  return context;
}
