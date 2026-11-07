import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

async function gaqlQuery(accessToken: string, customerId: string, query: string, loginCustomerId?: string) {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "",
    "Content-Type": "application/json",
  };
  if (loginCustomerId && loginCustomerId !== customerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const response = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
    { method: "POST", headers, body: JSON.stringify({ query }) }
  );

  if (!response.ok) {
    const err = await response.text();
    return { success: false, results: [], error: err };
  }
  const data = await response.json();
  return { success: true, results: data.results || [] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let userId: string | null = null;

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      // Check if it's service role key (for admin/cron calls)
      if (token === supabaseServiceKey) {
        // Admin call - userId will be provided in body
      } else {
        const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: `Bearer ${token}` } }
        });
        const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
        if (!claimsError && claimsData?.claims) {
          userId = claimsData.claims.sub as string;
        }
      }
    }

    const { campaign_id, user_id: bodyUserId } = await req.json();
    if (bodyUserId && !userId) userId = bodyUserId;
    
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get connection - use userId if available, otherwise get the first active one
    const connQuery = userId 
      ? supabase.from("user_connections").select("*").eq("user_id", userId).eq("connection_type", "google_ads").eq("status", "connected").order("created_at", { ascending: false }).limit(1).maybeSingle()
      : supabase.from("user_connections").select("*").eq("connection_type", "google_ads").eq("status", "connected").order("created_at", { ascending: false }).limit(1).maybeSingle();
    
    const { data: connection } = await connQuery;

    if (!connection?.refresh_token) {
      return new Response(JSON.stringify({ error: "Google Ads not connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await refreshAccessToken(connection.refresh_token);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Token refresh failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = connection.account_id as string;
    const metadata = connection.metadata as Record<string, unknown> || {};
    const managerCustomerId = metadata.manager_customer_id as string | undefined;

    const diagnosis: Record<string, unknown> = { campaign_id: campaign_id, customer_id: customerId };

    // 1. Campaign status & details
    const campQuery = `
      SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, 
             campaign.primary_status_reasons, campaign.bidding_strategy_type,
             campaign.advertising_channel_type, campaign_budget.amount_micros,
             metrics.cost_micros, metrics.clicks, metrics.impressions, 
             metrics.conversions, metrics.conversions_value
      FROM campaign 
      WHERE campaign.id = ${campaign_id}
        AND segments.date DURING LAST_7_DAYS
    `;
    const campResult = await gaqlQuery(accessToken, customerId, campQuery, managerCustomerId);
    if (campResult.success && campResult.results.length > 0) {
      const row = campResult.results[0] as Record<string, unknown>;
      diagnosis.campaign = row.campaign;
      diagnosis.budget = row.campaignBudget;
      // Aggregate metrics
      let totalImpressions = 0, totalClicks = 0, totalSpend = 0;
      for (const r of campResult.results as Record<string, unknown>[]) {
        const m = r.metrics as Record<string, unknown> || {};
        totalImpressions += Number(m.impressions || 0);
        totalClicks += Number(m.clicks || 0);
        totalSpend += Number(m.costMicros || 0) / 1_000_000;
      }
      diagnosis.metrics_7d = { impressions: totalImpressions, clicks: totalClicks, spend: totalSpend };
    } else {
      diagnosis.campaign_error = campResult.error;
    }

    // 2. Asset Group status
    const agQuery = `
      SELECT asset_group.id, asset_group.name, asset_group.status, 
             asset_group.primary_status, asset_group.primary_status_reasons,
             asset_group.ad_strength
      FROM asset_group 
      WHERE campaign.id = ${campaign_id}
    `;
    const agResult = await gaqlQuery(accessToken, customerId, agQuery, managerCustomerId);
    if (agResult.success) {
      diagnosis.asset_groups = agResult.results.map((r: any) => r.assetGroup);
    } else {
      diagnosis.asset_groups_error = agResult.error;
    }

    // 3. Asset Group assets (what's actually in there)
    const assetsQuery = `
      SELECT asset_group_asset.field_type, asset_group_asset.status,
             asset.name, asset.type, asset.text_asset.text,
             asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.sitelink_asset.link_text,
             asset.callout_asset.callout_text,
             asset.structured_snippet_asset.header
      FROM asset_group_asset 
      WHERE campaign.id = ${campaign_id}
    `;
    const assetsResult = await gaqlQuery(accessToken, customerId, assetsQuery, managerCustomerId);
    if (assetsResult.success) {
      const assetsByType: Record<string, unknown[]> = {};
      for (const r of assetsResult.results as Record<string, unknown>[]) {
        const aga = r.assetGroupAsset as Record<string, unknown>;
        const asset = r.asset as Record<string, unknown>;
        const fieldType = String(aga?.fieldType || "UNKNOWN");
        if (!assetsByType[fieldType]) assetsByType[fieldType] = [];
        assetsByType[fieldType].push({
          status: aga?.status,
          name: asset?.name,
          type: asset?.type,
          text: (asset?.textAsset as Record<string, unknown>)?.text,
          sitelinkText: (asset?.sitelinkAsset as Record<string, unknown>)?.linkText,
          calloutText: (asset?.calloutAsset as Record<string, unknown>)?.calloutText,
        });
      }
      diagnosis.assets = assetsByType;
      diagnosis.assets_count = Object.fromEntries(
        Object.entries(assetsByType).map(([k, v]) => [k, v.length])
      );
    } else {
      diagnosis.assets_error = assetsResult.error;
    }

    // 4. Asset Group Signals (audiences)
    const signalsQuery = `
      SELECT asset_group_signal.resource_name
      FROM asset_group_signal 
      WHERE campaign.id = ${campaign_id}
    `;
    const signalsResult = await gaqlQuery(accessToken, customerId, signalsQuery, managerCustomerId);
    if (signalsResult.success) {
      diagnosis.audience_signals = signalsResult.results;
      diagnosis.audience_signals_count = signalsResult.results.length;
    } else {
      diagnosis.audience_signals_error = signalsResult.error;
    }

    // 5. Conversion actions on this account
    const convQuery = `
      SELECT conversion_action.id, conversion_action.name, conversion_action.status,
             conversion_action.type, conversion_action.category
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
    `;
    const convResult = await gaqlQuery(accessToken, customerId, convQuery, managerCustomerId);
    if (convResult.success) {
      diagnosis.conversion_actions = convResult.results.map((r: any) => r.conversionAction);
    } else {
      diagnosis.conversion_actions_error = convResult.error;
    }

    // 6. Search themes
    const themesQuery = `
      SELECT asset_group_listing_group_filter.type,
             campaign_search_term_insight.category_label
      FROM campaign_search_term_insight
      WHERE campaign.id = ${campaign_id}
        AND segments.date DURING LAST_7_DAYS
    `;
    const themesResult = await gaqlQuery(accessToken, customerId, themesQuery, managerCustomerId);
    if (themesResult.success) {
      diagnosis.search_term_insights = themesResult.results;
    }

    return new Response(JSON.stringify({ success: true, diagnosis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[diagnose-pmax] Error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
