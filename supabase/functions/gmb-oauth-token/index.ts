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

    const { code, redirectUri, projectId } = await req.json();

    if (!code || !redirectUri) {
      return new Response(
        JSON.stringify({ error: "Code and redirectUri are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = Deno.env.get("GMB_GOOGLE_CLIENT_ID") || Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GMB_GOOGLE_CLIENT_SECRET") || Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "Google OAuth not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("GMB token exchange error:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to exchange code for tokens", details: errorText }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenResponse.json();

    // Verify project ownership
    if (projectId) {
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, user_id")
        .eq("id", projectId)
        .single();

      if (projectError || !project || project.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try to fetch GMB account info to get location name
      let locationName = null;
      let accountName = null;
      try {
        const accountsRes = await fetch(
          "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
          { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        );
        if (accountsRes.ok) {
          const accountsData = await accountsRes.json();
          const account = accountsData.accounts?.[0];
          if (account) {
            accountName = account.accountName || account.name;
            const locationsRes = await fetch(
              `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title&pageSize=10`,
              { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
            );
            if (locationsRes.ok) {
              const locationsData = await locationsRes.json();
              const first = locationsData.locations?.[0];
              locationName = first ? `${account.name}/${first.name}` : null;
            }

          }
        }
      } catch (e) {
        console.error("Error fetching GMB account info:", e);
      }

      // Upsert integration
      const config = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        location_name: locationName,
        account_name: accountName,
      };

      const { data: existing } = await supabase
        .from("integrations")
        .select("id")
        .eq("project_id", projectId)
        .eq("platform", "google_business")
        .single();

      if (existing) {
        // Update - preserve existing refresh_token if new one not provided
        const updateConfig = { ...config };
        if (!tokenData.refresh_token) {
          const { data: currentInt } = await supabase
            .from("integrations")
            .select("config")
            .eq("id", existing.id)
            .single();
          if (currentInt?.config?.refresh_token) {
            updateConfig.refresh_token = currentInt.config.refresh_token;
          }
        }

        await supabase
          .from("integrations")
          .update({
            config: updateConfig,
            is_connected: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("integrations")
          .insert({
            project_id: projectId,
            platform: "google_business",
            config,
            is_connected: true,
          });
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in gmb-oauth-token:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
