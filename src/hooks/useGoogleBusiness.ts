"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "./useProjects";
import { toast } from "sonner";

interface BusinessInsights {
  views: number;
  clicks: number;
  calls: number;
  directions: number;
}

interface Business {
  id: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  reviewCount: number;
  insights?: BusinessInsights;
}

interface PublishPostParams {
  content: string;
  type: "UPDATE" | "OFFER" | "EVENT";
  imageUrl?: string;
}

export function useGoogleBusiness() {
  const { project } = useActiveProject();
  const [business, setBusiness] = useState<Business | null>(null);
  const [locations, setLocations] = useState<Business[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project?.id) {
      checkConnection();
    }
  }, [project?.id]);

  const checkConnection = async () => {
    if (!project?.id) return;
    
    try {
      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("project_id", project.id)
        .eq("platform", "google_business")
        .single();

      if (integration?.is_connected) {
        setIsConnected(true);
        await fetchBusiness();
      }
    } catch (error) {
      console.error("Error checking GMB connection:", error);
    }
  };

  const connectGMB = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in first");
        return;
      }

      sessionStorage.setItem("gmb_redirect_uri", window.location.pathname);

      const { data, error } = await supabase.functions.invoke("gmb-oauth-url", {
        body: { 
          redirectUri: `${window.location.origin}/integrations`,
          projectId: project?.id 
        },
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error connecting GMB:", error);
      toast.error("Failed to connect Google Business");
    }
  };

  const disconnectGMB = async () => {
    if (!project?.id) return;
    try {
      const { error } = await supabase
        .from("integrations")
        .update({ is_connected: false, config: {} })
        .eq("project_id", project.id)
        .eq("platform", "google_business");

      if (error) throw error;

      setIsConnected(false);
      setBusiness(null);
      setLocations([]);
      setSelectedLocationIds([]);
      toast.success("Google My Business disconnected");
    } catch (error) {
      console.error("Error disconnecting GMB:", error);
      toast.error("Failed to disconnect");
    }
  };

  const fetchBusiness = async () => {
    if (!project?.id) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("gmb-fetch-business", {
        body: { projectId: project.id },
      });

      if (fnError) throw fnError;
      
      if (data?.tokenExpired) {
        setIsConnected(false);
        setError(data.error || "Session expired. Please reconnect.");
        toast.error("Google Business session expired. Please reconnect.");
        return;
      }
      
      if (data?.error && !data?.business) {
        setError(data.error);
      }
      
      if (data?.business) {
        setBusiness(data.business);
      }
      if (data?.locations) {
        setLocations(data.locations);
      }
      if (data?.selectedLocationIds) {
        setSelectedLocationIds(data.selectedLocationIds);
      }
    } catch (err) {
      console.error("Error fetching business:", err);
      setError("Failed to load business data");
    } finally {
      setIsLoading(false);
    }
  };

  const saveSelectedLocations = async (ids: string[]) => {
    if (!project?.id) return;

    setIsSaving(true);
    try {
      // Update the integration config with selected locations
      const { data: integration } = await supabase
        .from("integrations")
        .select("id, config")
        .eq("project_id", project.id)
        .eq("platform", "google_business")
        .single();

      if (!integration) throw new Error("No GMB integration found");

      const newConfig = { ...(integration.config as Record<string, unknown>), selected_locations: ids };
      const { error } = await supabase
        .from("integrations")
        .update({ config: newConfig })
        .eq("id", integration.id);

      if (error) throw error;

      setSelectedLocationIds(ids);
      toast.success(`${ids.length} store${ids.length > 1 ? "s" : ""} selected for auto-posting`);
    } catch (error) {
      console.error("Error saving selected locations:", error);
      toast.error("Failed to save store selection");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleLocation = (locationId: string) => {
    const newIds = selectedLocationIds.includes(locationId)
      ? selectedLocationIds.filter(id => id !== locationId)
      : [...selectedLocationIds, locationId];
    saveSelectedLocations(newIds);
  };

  const fetchInsights = async () => {
    if (!project?.id) return;
    
    try {
      const { data, error } = await supabase.functions.invoke("gmb-fetch-insights", {
        body: { projectId: project.id },
      });

      if (error) throw error;
      
      if (data?.insights && business) {
        setBusiness({ ...business, insights: data.insights });
      }
    } catch (error) {
      console.error("Error fetching insights:", error);
    }
  };

  const publishPost = async (params: PublishPostParams) => {
    if (!project?.id) throw new Error("No project selected");
    
    const { data, error } = await supabase.functions.invoke("gmb-publish-post", {
      body: { 
        projectId: project.id,
        ...params 
      },
    });

    if (error) throw error;
    return data;
  };

  return {
    business,
    locations,
    selectedLocationIds,
    isLoading,
    isConnected,
    isSaving,
    error,
    connectGMB,
    disconnectGMB,
    fetchBusiness,
    fetchInsights,
    publishPost,
    saveSelectedLocations,
    toggleLocation,
  };
}
