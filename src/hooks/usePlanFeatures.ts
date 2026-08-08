"use client";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { isUnlimited } from "@/lib/stripe-products";

/**
 * Single source of truth for plan capability gating on the front-end.
 * Returns the current plan, normalized limits (null = unlimited), and feature flags.
 */
export function usePlanFeatures() {
  const ctx = useSubscriptionContext();
  const hasPlan = ctx.isSubscribed || ctx.isTrial;
  return {
    plan: ctx.plan,
    cycle: ctx.cycle,
    hasPlan,
    isSubscribed: ctx.isSubscribed,
    isTrial: ctx.isTrial,
    sitesLimit: ctx.sitesLimit,
    articlesLimit: ctx.articlesLimit,
    sitesUnlimited: isUnlimited(ctx.sitesLimit),
    articlesUnlimited: isUnlimited(ctx.articlesLimit),
    features: ctx.features,
  };
}
