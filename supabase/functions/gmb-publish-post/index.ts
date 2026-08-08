import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { projectId, content, type, imageUrl } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get GMB integration WITH project ownership verification
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*, projects!inner(user_id)")
      .eq("project_id", projectId)
      .eq("platform", "google_business")
      .single();

    if (intError || !integration?.config?.access_token) {
      return new Response(
        JSON.stringify({ error: "GMB not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CRITICAL SECURITY CHECK: Verify user owns this integration
    const integrationOwnerId = (integration.projects as { user_id: string }).user_id;
    if (integrationOwnerId !== user.id) {
      console.error(`[gmb-publish-post] SECURITY VIOLATION: User ${user.id} attempted to access integration owned by ${integrationOwnerId}`);
      return new Response(
        JSON.stringify({ error: "Access denied - integration belongs to another user" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = integration.config.access_token;
    
    // Refresh token if expired
    const refreshToken = integration.config.refresh_token;
    if (refreshToken) {
      const clientId = Deno.env.get("GMB_GOOGLE_CLIENT_ID") || Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GMB_GOOGLE_CLIENT_SECRET") || Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (clientId && clientSecret) {
        const expiresAt = integration.config.token_expires_at;
        const isExpired = !expiresAt || new Date(expiresAt) <= new Date();
        if (isExpired) {
          const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: refreshToken,
              grant_type: "refresh_token",
            }),
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            accessToken = refreshData.access_token;
            await supabase.from("integrations").update({
              config: { ...integration.config, access_token: accessToken, token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString() },
              updated_at: new Date().toISOString(),
            }).eq("id", integration.id);
          }
        }
      }
    }

    const selectedLocations: string[] = integration.config.selected_locations || [];
    const locationName = integration.config.location_name;

    // Determine which locations to post to
    const locationsToPost = selectedLocations.length > 0 
      ? selectedLocations 
      : locationName ? [locationName] : [];

    if (locationsToPost.length === 0) {
      return new Response(
        JSON.stringify({ error: "No business location configured or selected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build post body
    const postBody: any = {
      languageCode: "en",
      summary: content.substring(0, 1500),
      topicType: type || "STANDARD",
    };

    if (type === "OFFER") {
      postBody.callToAction = {
        actionType: "LEARN_MORE",
        url: integration.config.website_url || "",
      };
    }

    if (imageUrl) {
      postBody.media = [
        {
          mediaFormat: "PHOTO",
          sourceUrl: imageUrl,
        },
      ];
    }

    // Post to ALL selected locations
    const results = [];
    for (const loc of locationsToPost) {
      try {
        const postResponse = await fetch(
          `https://mybusiness.googleapis.com/v4/${loc}/localPosts`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(postBody),
          }
        );

        if (!postResponse.ok) {
          const errorText = await postResponse.text();
          console.error(`GMB post error for ${loc}:`, errorText);
          results.push({ location: loc, success: false, error: errorText });
        } else {
          const postData = await postResponse.json();
          results.push({ location: loc, success: true, post: postData });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.push({ location: loc, success: false, error: msg });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({ 
        success: successCount > 0, 
        results,
        message: `Published to ${successCount}/${results.length} location(s)` 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error publishing GMB post:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
