import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v22";

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: GOOGLE_CLIENT_SECRET || "",
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
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN || "",
      "Content-Type": "application/json",
    };
    if (managerCustomerId && managerCustomerId.replace(/-/g, "") !== customerId) {
      apiHeaders["login-customer-id"] = managerCustomerId.replace(/-/g, "");
    }

    const query = `SELECT conversion_action.name, conversion_action.id, conversion_action.resource_name, conversion_action.category, conversion_action.status, conversion_action.type, conversion_action.counting_type, conversion_action.tag_snippets, conversion_action.value_settings, conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status != 'REMOVED'`;

    const response = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      { method: "POST", headers: apiHeaders, body: JSON.stringify({ query }) }
    );

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: "Failed to list conversions: " + errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const conversions = (data.results || []).map((row: any) => {
      const ca = row.conversionAction;
      let conversionLabel = "";
      if (ca.tagSnippets && Array.isArray(ca.tagSnippets)) {
        for (const snippet of ca.tagSnippets) {
          if (snippet.type === "EVENT_SNIPPET" && snippet.eventSnippet) {
            const match = snippet.eventSnippet.match(/send_to['":\s]+['"]?(AW-[^'"}\s,]+)/);
            if (match) { conversionLabel = match[1]; break; }
          }
        }
      }

      return {
        name: ca.name,
        id: ca.id,
        category: ca.category,
        status: ca.status,
        type: ca.type,
        countingType: ca.countingType,
        primaryForGoal: ca.primaryForGoal,
        conversionLabel: conversionLabel || `AW-${customerId}/${ca.id}`,
        defaultValue: ca.valueSettings?.defaultValue,
        currencyCode: ca.valueSettings?.defaultCurrencyCode,
      };
    });

    return new Response(JSON.stringify({ success: true, conversions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
