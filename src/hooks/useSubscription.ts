"use client";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";

export function useSubscription() {
  const subscription = useSubscriptionContext();

  const startCheckout = async () => {
    const url = await subscription.startCheckout();
    if (url) window.location.href = url;
  };

  const openCustomerPortal = async () => {
    const url = await subscription.openCustomerPortal();
    if (url) window.open(url, "_blank");
  };

  return {
    subscribed: subscription.isSubscribed,
    trial: subscription.isTrial,
    productId: subscription.productId,
    subscriptionEnd: subscription.subscriptionEnd,
    creditsTotal: subscription.creditsTotal,
    plan: subscription.plan,
    cycle: subscription.cycle,
    sitesLimit: subscription.sitesLimit,
    articlesLimit: subscription.articlesLimit,
    features: subscription.features,
    isLoading: subscription.isLoading,
    checkSubscription: subscription.checkSubscription,
    startCheckout,
    openCustomerPortal,
  };
}

