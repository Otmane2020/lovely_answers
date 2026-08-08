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

    const { projectId } = await req.json();

    // Get GMB integration for this project
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("project_id", projectId)
      .eq("platform", "google_business")
      .single();

    if (intError || !integration?.config?.access_token) {
      return new Response(
        JSON.stringify({ error: "GMB not connected", business: null, locations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = integration.config.access_token;

    // Try to refresh token if we have a refresh_token
    const refreshToken = integration.config.refresh_token;
    if (refreshToken) {
      const clientId = Deno.env.get("GMB_GOOGLE_CLIENT_ID") || Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GMB_GOOGLE_CLIENT_SECRET") || Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (clientId && clientSecret) {
        const expiresAt = integration.config.token_expires_at;
        const isExpired = !expiresAt || new Date(expiresAt) <= new Date();
        if (isExpired) {
          console.log("GMB token expired, refreshing...");
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
            // Update stored token
            await supabase
              .from("integrations")
              .update({
                config: {
                  ...integration.config,
                  access_token: accessToken,
                  token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", integration.id);
            console.log("GMB token refreshed successfully");
          } else {
            const refreshError = await refreshRes.text();
            console.error("GMB token refresh failed:", refreshError);
            // Mark integration as disconnected since refresh failed
            await supabase
              .from("integrations")
              .update({ is_connected: false, updated_at: new Date().toISOString() })
              .eq("id", integration.id);
            return new Response(
              JSON.stringify({ error: "GMB session expired. Please reconnect your Google Business account.", business: null, locations: [], tokenExpired: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }
    const accountsResponse = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      console.error("GMB accounts error:", errorText);
      const status = accountsResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Google API rate limit exceeded. Please try again in a minute.", business: null, locations: [], rateLimited: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 401 || status === 403) {
        return new Response(
          JSON.stringify({ error: "GMB access token expired. Please reconnect.", business: null, locations: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Failed to fetch GMB accounts", business: null, locations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountsData = await accountsResponse.json();
    const accounts = accountsData.accounts || [];

    if (accounts.length === 0) {
      return new Response(
        JSON.stringify({ business: null, locations: [], error: "No GMB account found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch locations from ALL accounts
    const allLocations: any[] = [];
    const READ_MASK = "name,title,storefrontAddress,phoneNumbers,websiteUri,metadata";

    for (const account of accounts) {
      try {
        const locationsResponse = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=${encodeURIComponent(READ_MASK)}&pageSize=100`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (locationsResponse.ok) {
          const locationsData = await locationsResponse.json();
          if (locationsData.locations) {
            for (const loc of locationsData.locations) {
              // Build full resource path required by v4 Posts API
              loc.__fullName = `${account.name}/${loc.name}`;
              allLocations.push(loc);
            }
          }
        } else {
          const errTxt = await locationsResponse.text();
          console.error(`GMB locations error for ${account.name} (${locationsResponse.status}):`, errTxt);
        }
      } catch (err) {
        console.error(`Error fetching locations for ${account.name}:`, err);
      }
    }

    if (allLocations.length === 0) {
      return new Response(
        JSON.stringify({ business: null, locations: [], error: "No business location found. Verify the connected Google account manages a Business Profile and that the GMB API is enabled." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format ALL locations (id = full accounts/.../locations/... path)
    const locations = allLocations.map((location) => ({
      id: location.__fullName,
      name: location.title || location.locationName,
      address: formatAddress(location.storefrontAddress || location.address),
      phone: location.phoneNumbers?.primaryPhone || "",
      website: location.websiteUri || "",
      rating: location.metadata?.rating || 0,
      reviewCount: location.metadata?.reviewCount || 0,
    }));


    // Return first location as "business" for backward compat, plus all locations
    const selectedIds: string[] = integration.config.selected_locations || [];

    return new Response(
      JSON.stringify({ 
        business: locations[0], 
        locations,
        selectedLocationIds: selectedIds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error fetching business:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatAddress(address: any): string {
  if (!address) return "";
  const parts = [
    address.addressLines?.join(", "),
    address.locality,
    address.administrativeArea,
    address.postalCode,
    address.regionCode,
  ].filter(Boolean);
  return parts.join(", ");
}
