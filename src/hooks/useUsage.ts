"use client";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";

/**
 * Tracks current usage vs. subscription plan limits.
 * - projectsCount: total projects owned by the user
 * - articlesThisMonth: articles created across all projects this calendar month
 * - sitesLimit / articlesLimit come from the active subscription (null = unlimited or not loaded)
 */
export function useUsage() {
  const { user } = useAuth();
  const { sitesLimit, articlesLimit, subscribed, trial, isLoading: subscriptionLoading } = useSubscription();
  const hasPlan = subscribed || trial;

  const projectsQuery = useQuery({
    queryKey: ["usage", "projects-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const articlesQuery = useQuery({
    queryKey: ["usage", "articles-month", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user!.id);
      const ids = (projects ?? []).map((p) => p.id);
      if (ids.length === 0) return 0;

      const { count, error } = await supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .in("project_id", ids)
        .gte("created_at", monthStart.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const projectsCount = projectsQuery.data ?? 0;
  const articlesThisMonth = articlesQuery.data ?? 0;

  const canCreateProject =
    !subscriptionLoading && hasPlan && (sitesLimit == null || projectsCount < sitesLimit);
  const canGenerateArticle =
    !subscriptionLoading && hasPlan && (articlesLimit == null || articlesThisMonth < articlesLimit);

  return {
    projectsCount,
    articlesThisMonth,
    sitesLimit,
    articlesLimit,
    hasPlan,
    canCreateProject,
    canGenerateArticle,
    sitesRemaining:
      sitesLimit == null ? Infinity : Math.max(0, sitesLimit - projectsCount),
    articlesRemaining:
      articlesLimit == null
        ? Infinity
        : Math.max(0, articlesLimit - articlesThisMonth),
    isLoading: subscriptionLoading || projectsQuery.isLoading || articlesQuery.isLoading,
    refetch: () => {
      projectsQuery.refetch();
      articlesQuery.refetch();
    },
  };
}
