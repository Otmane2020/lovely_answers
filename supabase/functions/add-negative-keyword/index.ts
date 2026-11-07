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
    const { adGroupId, campaignId, keyword, action } = await req.json();
    // action: "add" or "remove"
    // keyword: the keyword text to add as negative

    if (!keyword) {
      return new Response(JSON.stringify({ error: "keyword is required" }), {
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

    // If adGroupId is provided, add as ad group level negative keyword
    // Otherwise, add as campaign level negative keyword
    if (adGroupId) {
      // Find ad group resource name
      const searchQuery = `SELECT ad_group.resource_name FROM ad_group WHERE ad_group.id = ${adGroupId}`;
      const searchRes = await fetch(
        `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
        { method: "POST", headers: apiHeaders, body: JSON.stringify({ query: searchQuery }) }
      );
      if (!searchRes.ok) {
        const errText = await searchRes.text();
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

      // Add negative keyword to ad group
      const mutateBody = {
        operations: [{
          create: {
            adGroup: adGroupResource,
            status: "ENABLED",
            negative: true,
            keyword: {
              text: keyword,
              matchType: "EXACT",
            },
          },
        }],
      };

      console.log(`[NEG-KW] Adding "${keyword}" as negative to ad group ${adGroupId}...`);
      const mutateRes = await fetch(
        `${GOOGLE_ADS_API_BASE}/customers/${customerId}/adGroupCriteria:mutate`,
        { method: "POST", headers: apiHeaders, body: JSON.stringify(mutateBody) }
      );

      if (!mutateRes.ok) {
        const errText = await mutateRes.text();
        console.error("[NEG-KW] Mutate failed:", errText);
        return new Response(JSON.stringify({ error: "Failed to add negative keyword: " + errText }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await mutateRes.json();
      console.log("[NEG-KW] Success:", JSON.stringify(result));

      return new Response(JSON.stringify({
        success: true,
        keyword,
        level: "ad_group",
        adGroupId,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Campaign-level negative keyword
    if (campaignId) {
      // Find campaign resource name
      const searchQuery = `SELECT campaign.resource_name FROM campaign WHERE campaign.id = ${campaignId}`;
      const searchRes = await fetch(
        `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
        { method: "POST", headers: apiHeaders, body: JSON.stringify({ query: searchQuery }) }
      );
      if (!searchRes.ok) {
        const errText = await searchRes.text();
        return new Response(JSON.stringify({ error: "Failed to find campaign: " + errText }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const searchData = await searchRes.json();
      const campaignResource = searchData.results?.[0]?.campaign?.resourceName;
      if (!campaignResource) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mutateBody = {
        operations: [{
          create: {
            campaign: campaignResource,
            negative: true,
            keyword: {
              text: keyword,
              matchType: "EXACT",
            },
          },
        }],
      };

      console.log(`[NEG-KW] Adding "${keyword}" as negative to campaign ${campaignId}...`);
      const mutateRes = await fetch(
        `${GOOGLE_ADS_API_BASE}/customers/${customerId}/campaignCriteria:mutate`,
        { method: "POST", headers: apiHeaders, body: JSON.stringify(mutateBody) }
      );

      if (!mutateRes.ok) {
        const errText = await mutateRes.text();
        console.error("[NEG-KW] Campaign mutate failed:", errText);
        return new Response(JSON.stringify({ error: "Failed to add negative keyword: " + errText }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await mutateRes.json();
      console.log("[NEG-KW] Campaign level success:", JSON.stringify(result));

      return new Response(JSON.stringify({
        success: true,
        keyword,
        level: "campaign",
        campaignId,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no adGroupId or campaignId, add to the first active campaign as shared negative
    // Find first active campaign
    const campaignQuery = `SELECT campaign.id, campaign.resource_name FROM campaign WHERE campaign.status = 'ENABLED' LIMIT 1`;
    const campaignRes = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      { method: "POST", headers: apiHeaders, body: JSON.stringify({ query: campaignQuery }) }
    );

    if (!campaignRes.ok) {
      return new Response(JSON.stringify({ error: "No active campaign found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const campaignData = await campaignRes.json();
    const firstCampaign = campaignData.results?.[0]?.campaign;
    if (!firstCampaign) {
      return new Response(JSON.stringify({ error: "No active campaign found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mutateBody = {
      operations: [{
        create: {
          campaign: firstCampaign.resourceName,
          negative: true,
          keyword: {
            text: keyword,
            matchType: "EXACT",
          },
        },
      }],
    };

    console.log(`[NEG-KW] Adding "${keyword}" to first active campaign...`);
    const mutateRes = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/campaignCriteria:mutate`,
      { method: "POST", headers: apiHeaders, body: JSON.stringify(mutateBody) }
    );

    if (!mutateRes.ok) {
      const errText = await mutateRes.text();
      return new Response(JSON.stringify({ error: "Failed to add negative keyword: " + errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await mutateRes.json();

    return new Response(JSON.stringify({
      success: true,
      keyword,
      level: "campaign",
      campaignId: firstCampaign.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[NEG-KW] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
