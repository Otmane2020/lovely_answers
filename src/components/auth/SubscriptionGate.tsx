"use client";
import { ReactNode, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";

/**
 * Gate that requires an active subscription OR trial.
 * - If not authenticated → /auth?mode=signup
 * - If authenticated but no sub/trial → /checkout
 * - Otherwise renders children.
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { isSubscribed, isTrial, isLoading: subLoading } = useSubscriptionContext();

  useEffect(() => {
    if (authLoading || subLoading) return;
    if (!user) {
      window.location.replace("/auth?mode=signup");
      return;
    }
    if (!isSubscribed && !isTrial) {
      window.location.replace("/checkout?plan=pro&cycle=annual");
    }
  }, [user, authLoading, subLoading, isSubscribed, isTrial]);

  if (authLoading || subLoading || !user || (!isSubscribed && !isTrial)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
