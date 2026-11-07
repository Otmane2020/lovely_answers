"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  website_url: string;
  domain: string | null;
  language: string;
  business_description: string | null;
  business_type: string | null;
  audience: string | null;
  brand_name: string | null;
  example_url: string | null;
  competitors: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useProjects() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["projects", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Project[];
    },
    enabled: !!user,
  });
}

export function useActiveProject() {
  const { data: projects, isLoading } = useProjects();
  
  // Select the most recent active project deterministically
  const activeProject = projects
    ?.filter((p) => p.is_active)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] 
    || projects?.[0];
  
  return {
    project: activeProject,
    projects,
    isLoading,
  };
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { sitesLimit: contextSitesLimit, subscribed, trial } = useSubscription();

  return useMutation({
    mutationFn: async (projectData: {
      name: string;
      website_url: string;
      domain?: string;
      language: string;
      business_description?: string;
      business_type?: string;
      audience?: string;
      brand_name?: string;
      example_url?: string;
      competitors?: string[];
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Refresh Stripe-backed plan state first so paid/full-access users are not blocked by stale DB limits.
      let hasLiveAccess = subscribed || trial;
      let sitesLimit: number | null | undefined = hasLiveAccess ? contextSitesLimit : undefined;
      const { data: liveSub } = await supabase.functions.invoke("check-subscription").catch(() => ({ data: null }));
      if (liveSub?.subscribed || liveSub?.trial) {
        hasLiveAccess = true;
        sitesLimit = liveSub.sites_limit ?? null;
      }

      // Fallback to the latest subscription row only when live subscription state is unavailable.
      if (!hasLiveAccess && sitesLimit === undefined) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("sites_limit, status")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        sitesLimit = (sub as any)?.sites_limit as number | null | undefined;
      }

      if (typeof sitesLimit === "number") {
        const { count } = await supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if ((count ?? 0) >= sitesLimit) {
          throw new Error(
            `SITES_LIMIT_REACHED: Your plan allows up to ${sitesLimit} site${sitesLimit > 1 ? "s" : ""}. Upgrade to add more.`
          );
        }
      }

      const { data, error } = await supabase
        .from("projects")
        .insert({
          ...projectData,
          user_id: user.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Project;

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useSetActiveProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (projectId: string) => {
      if (!user) throw new Error("Not authenticated");

      // First, set all projects to inactive
      await supabase
        .from("projects")
        .update({ is_active: false })
        .eq("user_id", user.id);

      // Then set the selected project as active
      const { error } = await supabase
        .from("projects")
        .update({ is_active: true })
        .eq("id", projectId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      projectId,
      updates,
    }: {
      projectId: string;
      updates: Partial<{
        name: string;
        website_url: string;
        domain: string;
        language: string;
        business_description: string;
        business_type: string;
        audience: string;
        brand_name: string;
        brand_color: string;
        brand_voice_url: string;
        sitemap_url: string;
        example_url: string;
        competitors: string[];
      }>;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", projectId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
