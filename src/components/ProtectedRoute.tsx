"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { useProjects } from "@/hooks/useProjects";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSubscription?: boolean;
}

// Routes that an authenticated user with no project is allowed to visit
const NO_PROJECT_ALLOWED = [
  "/wizard",
  "/onboarding",
  "/auth",
  "/checkout",
  "/pricing",
  "/billing",
  "/subscription",
  "/thank-you",
  "/support",
  "/account",
  "/settings",
];

export function ProtectedRoute({ children, requireSubscription = true }: ProtectedRouteProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { isSubscribed, isTrial, isLoading: subLoading } = useSubscriptionContext();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const pathname = usePathname();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth");
    }
  }, [authLoading, user, router]);

  // Redirect users without any project to the wizard
  useEffect(() => {
    if (!authLoading && user && !projectsLoading && projects && projects.length === 0) {
      const isAllowed = NO_PROJECT_ALLOWED.some((p) => pathname?.startsWith(p));
      if (!isAllowed) {
        router.push("/wizard");
      }
    }
  }, [authLoading, user, projectsLoading, projects, pathname, router]);

  useEffect(() => {
    if (!authLoading && !subLoading && user) {
      const isOnboardingPage = pathname === "/onboarding";
      if (requireSubscription && !isOnboardingPage && !isSubscribed && !isTrial) {
        router.push("/checkout");
      }
    }
  }, [authLoading, subLoading, user, isSubscribed, isTrial, pathname, requireSubscription, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (requireSubscription && subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Checking subscription...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
