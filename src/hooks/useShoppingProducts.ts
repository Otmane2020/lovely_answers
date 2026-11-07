"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/hooks/useProjects";

export interface ShoppingProduct {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  product_url: string | null;
  brand: string | null;
  category: string | null;
  availability: string | null;
  condition: string | null;
  gtin: string | null;
  mpn: string | null;
  feed_item_id: string | null;
  ai_title: string | null;
  ai_description: string | null;
  ai_faq: any | null;
  ai_schema_markup: any | null;
  ai_score: number | null;
  status: string | null;
  scheduled_date: string | null;
  published_at: string | null;
  published_url: string | null;
  language: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShoppingFeed {
  id: string;
  project_id: string;
  feed_url: string | null;
  feed_type: string | null;
  last_synced_at: string | null;
  product_count: number | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export function useShoppingProducts() {
  const { project } = useActiveProject();

  return useQuery({
    queryKey: ["shopping-products", project?.id],
    queryFn: async () => {
      if (!project) return [];
      const { data, error } = await supabase
        .from("shopping_products")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ShoppingProduct[];
    },
    enabled: !!project,
  });
}

export function useShoppingFeeds() {
  const { project } = useActiveProject();

  return useQuery({
    queryKey: ["shopping-feeds", project?.id],
    queryFn: async () => {
      if (!project) return [];
      const { data, error } = await supabase
        .from("shopping_feeds")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ShoppingFeed[];
    },
    enabled: !!project,
  });
}

export function useImportFeed() {
  const queryClient = useQueryClient();
  const { project } = useActiveProject();

  return useMutation({
    mutationFn: async ({ feedUrl }: { feedUrl: string }) => {
      if (!project) throw new Error("No active project");
      const { data, error } = await supabase.functions.invoke("parse-shopping-feed", {
        body: { feedUrl, projectId: project.id, language: project.language },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-feeds"] });
    },
  });
}

export function useGenerateProductAI() {
  const queryClient = useQueryClient();
  const { project } = useActiveProject();

  return useMutation({
    mutationFn: async ({ productId }: { productId: string }) => {
      if (!project) throw new Error("No active project");
      const { data, error } = await supabase.functions.invoke("generate-product-ai", {
        body: { productId, projectId: project.id, language: project.language },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-products"] });
    },
  });
}

export function useGenerateAllProductsAI() {
  const queryClient = useQueryClient();
  const { project } = useActiveProject();

  return useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("No active project");
      const { data, error } = await supabase.functions.invoke("generate-product-ai", {
        body: { projectId: project.id, language: project.language, all: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-products"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from("shopping_products")
        .delete()
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-products"] });
    },
  });
}

export function useDeleteAllProducts() {
  const queryClient = useQueryClient();
  const { project } = useActiveProject();

  return useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("No active project");
      // Delete planning first (FK dependency)
      await (supabase.from("shopping_planning" as any).delete().eq("project_id", project.id) as any);
      // Delete products
      const { error: prodErr } = await supabase.from("shopping_products").delete().eq("project_id", project.id);
      if (prodErr) throw prodErr;
      // Delete feeds
      const { error: feedErr } = await supabase.from("shopping_feeds").delete().eq("project_id", project.id);
      if (feedErr) throw feedErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-feeds"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-planning"] });
    },
  });
}
