"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "./useProjects";
import { toast } from "sonner";

export interface GeoContent {
  id: string;
  project_id: string;
  topic: string;
  brand: string;
  website: string | null;
  title: string | null;
  meta_description: string | null;
  content: string | null;
  html_content: string | null;
  content_type: string;
  score: number;
  slug: string | null;
  keywords: string[];
  is_public: boolean;
  published_url: string | null;
  published_at: string | null;
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
}

export function useGeoContents() {
  const { project } = useActiveProject();

  return useQuery({
    queryKey: ["geo_contents", project?.id],
    queryFn: async () => {
      if (!project) return [];
      const { data, error } = await supabase
        .from("geo_contents")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data || []) as GeoContent[]).filter((item) => {
        const content = `${item.html_content || item.content || ""}`.trim();
        return content.length > 0;
      });
    },
    enabled: !!project,
  });
}

export function useGenerateGeoContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      topic: string;
      brand: string;
      website?: string;
      keywords?: string[];
      projectId: string;
      contentType: string;
      language?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("generate-geo-content", {
        body: params,
      });

      if (res.error) {
        console.error("[generate-geo-content] edge error:", res.error);
        throw new Error("GENERATION_FAILED");
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo_contents"] });
      toast.success("GEO content generated!");
    },
    onError: (err: Error) => {
      console.error("[useGenerateGeoContent]", err);
      toast.error("Content is being prepared. Please try again in a moment.");
    },
  });
}

export function useDeleteGeoContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("geo_contents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo_contents"] });
      toast.success("Content deleted");
    },
  });
}
