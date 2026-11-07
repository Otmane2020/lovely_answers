import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v22";

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { adGroupId, campaignId, customerId: reqCustomerId, action } = await req.json();
    // action: "ENABLED" or "PAUSED"

    if (!adGroupId || !action) {
      return new Response(JSON.stringify({ error: "adGroupId and action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Google Ads connection
    const { data: connection } = await supabase
      .from("user_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("connection_type", "google_ads")
      .eq("status", "connected")
      .maybeSingle();

    if (!connection?.access_token || !connection.account_id) {
      return new Response(JSON.stringify({ error: "Google Ads not connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = connection.access_token as string;
    if (connection.token_expires_at && new Date(connection.token_expires_at as string) < new Date()) {
      const newToken = await refreshAccessToken(connection.refresh_token || "");
      if (!newToken) {
        return new Response(JSON.stringify({ error: "Token refresh failed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accessToken = newToken;
    }

    const customerId = (connection.account_id as string).replace(/-/g, "");
    const metadata = connection.metadata as Record<string, unknown> || {};
    const managerCustomerId = metadata.manager_customer_id as string | undefined;

    const apiHeaders: Record<string, string> = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "",
      "Content-Type": "application/json",
    };
    if (managerCustomerId && managerCustomerId.replace(/-/g, "") !== customerId) {
      apiHeaders["login-customer-id"] = managerCustomerId.replace(/-/g, "");
    }

    // First find the ad group resource name
    const searchQuery = `SELECT ad_group.resource_name, ad_group.name, ad_group.status FROM ad_group WHERE ad_group.id = ${adGroupId}`;
    const searchRes = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      { method: "POST", headers: apiHeaders, body: JSON.stringify({ query: searchQuery }) }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error("[TOGGLE] Search failed:", errText);
      return new Response(JSON.stringify({ error: "Failed to find ad group: " + errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchData = await searchRes.json();
    const adGroupResource = searchData.results?.[0]?.adGroup?.resourceName;
    
    if (!adGroupResource) {
      return new Response(JSON.stringify({ error: "Ad group not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mutate the ad group status
    const mutateBody = {
      operations: [{
        update: {
          resourceName: adGroupResource,
          status: action, // "ENABLED" or "PAUSED"
        },
        updateMask: "status",
      }],
    };

    console.log(`[TOGGLE] Setting ad group ${adGroupId} to ${action}...`);
    const mutateRes = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/adGroups:mutate`,
      { method: "POST", headers: apiHeaders, body: JSON.stringify(mutateBody) }
    );

    if (!mutateRes.ok) {
      const errText = await mutateRes.text();
      console.error("[TOGGLE] Mutate failed:", errText);
      return new Response(JSON.stringify({ error: "Failed to update ad group: " + errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mutateData = await mutateRes.json();
    console.log(`[TOGGLE] Success:`, JSON.stringify(mutateData));

    return new Response(JSON.stringify({ 
      success: true, 
      adGroupId,
      newStatus: action,
      resourceName: adGroupResource,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[TOGGLE] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
