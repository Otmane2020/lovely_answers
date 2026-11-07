import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v22";

interface SyncResult {
  campaigns: number;
  keywords: number;
  ads: number;
  errors: string[];
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
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

    if (!response.ok) {
      console.error("[SYNC] Token refresh failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("[SYNC] Token refresh error:", error);
    return null;
  }
}

async function executeGAQLQuery(
  accessToken: string,
  customerId: string,
  query: string,
  loginCustomerId?: string
): Promise<{ success: boolean; results: unknown[]; error?: string }> {
  try {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN || "",
      "Content-Type": "application/json",
    };
    
    if (loginCustomerId && loginCustomerId !== customerId) {
      headers["login-customer-id"] = loginCustomerId;
    }

    const response = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[SYNC] GAQL query failed:", errorText);
      return { success: false, results: [], error: errorText };
    }

    const data = await response.json();
    return { success: true, results: data.results || [] };
  } catch (error) {
    console.error("[SYNC] GAQL query error:", error);
    return { success: false, results: [], error: String(error) };
  }
}

// deno-lint-ignore no-explicit-any
async function performFullSync(
  supabase: any,
  accessToken: string,
  customerId: string,
  managerCustomerId: string | undefined,
  userId: string
): Promise<SyncResult> {
  console.log(`[SYNC] Starting full sync for customer ${customerId}, user ${userId}`);
  
  const syncResult: SyncResult = {
    campaigns: 0,
    keywords: 0,
    ads: 0,
    errors: [],
  };

  const campaignsQuery = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.primary_status,
      campaign.primary_status_reasons,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign_budget.id,
      campaign_budget.amount_micros,
      campaign.geo_target_type_setting.positive_geo_target_type,
      campaign.network_settings.target_google_search,
      campaign.network_settings.target_search_network,
      campaign.network_settings.target_content_network,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      customer.id
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date DURING LAST_7_DAYS
  `;

  const campaignsResult = await executeGAQLQuery(accessToken, customerId, campaignsQuery, managerCustomerId);
  
  if (!campaignsResult.success) {
    syncResult.errors.push(`Campaigns sync failed: ${campaignsResult.error}`);
    return syncResult;
  }

  const campaignMap = new Map<string, {
    campaign: Record<string, unknown>;
    spend: number;
    clicks: number;
    impressions: number;
    conversions: number;
    revenue: number;
  }>();

  for (const row of campaignsResult.results as Record<string, unknown>[]) {
    const campaign = row.campaign as Record<string, unknown>;
    const metrics = row.metrics as Record<string, unknown> || {};
    const budget = row.campaignBudget as Record<string, unknown> || {};
    const campId = String(campaign.id);

    const existing = campaignMap.get(campId) || {
      campaign: { ...campaign, budget },
      spend: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      revenue: 0,
    };

    existing.spend += Number(metrics.costMicros || 0) / 1000000;
    existing.clicks += Number(metrics.clicks || 0);
    existing.impressions += Number(metrics.impressions || 0);
    existing.conversions += Number(metrics.conversions || 0);
    existing.revenue += Number(metrics.conversionsValue || 0);

    campaignMap.set(campId, existing);
  }

  for (const [campId, data] of campaignMap.entries()) {
    const campaign = data.campaign;
    const budget = campaign.budget as Record<string, unknown> || {};
    const networkSettings = campaign.networkSettings as Record<string, unknown> || {};
    
    const ctr = data.impressions > 0 ? data.clicks / data.impressions : 0;
    const cpc = data.clicks > 0 ? data.spend / data.clicks : 0;
    const roas = data.spend > 0 ? data.revenue / data.spend : 0;

    const { error: upsertError } = await supabase
      .from("campaigns_sync")
      .upsert({
        user_id: userId,
        google_campaign_id: campId,
        google_customer_id: customerId,
        name: String(campaign.name || ""),
        status: String(campaign.status || "UNKNOWN"),
        primary_status: campaign.primaryStatus ? String(campaign.primaryStatus) : null,
        primary_status_reasons: campaign.primaryStatusReasons as string[] || null,
        advertising_channel_type: campaign.advertisingChannelType ? String(campaign.advertisingChannelType) : null,
        bidding_strategy_type: campaign.biddingStrategyType ? String(campaign.biddingStrategyType) : null,
        budget_resource_name: budget.resourceName ? String(budget.resourceName) : null,
        budget_amount_micros: budget.amountMicros ? Number(budget.amountMicros) : null,
        network_settings: networkSettings,
        spend_7d: data.spend,
        clicks_7d: data.clicks,
        impressions_7d: data.impressions,
        conversions_7d: data.conversions,
        revenue_7d: data.revenue,
        ctr_7d: ctr,
        cpc_7d: cpc,
        roas_7d: roas,
        last_synced_at: new Date().toISOString(),
        sync_status: "synced",
      }, { onConflict: "user_id,google_campaign_id" });

    if (upsertError) {
      console.error(`[SYNC] Failed to upsert campaign ${campId}:`, upsertError);
      syncResult.errors.push(`Campaign ${campId}: ${upsertError.message}`);
    } else {
      syncResult.campaigns++;
    }
  }

  console.log(`[SYNC] Synced ${syncResult.campaigns} campaigns`);

  for (const [campId] of campaignMap.entries()) {
    const keywordsResult = await syncCampaignKeywords(
      supabase, accessToken, customerId, managerCustomerId, userId, campId
    );
    syncResult.keywords += keywordsResult.count;
    if (keywordsResult.error) syncResult.errors.push(keywordsResult.error);
  }

  for (const [campId] of campaignMap.entries()) {
    const adsResult = await syncCampaignAds(
      supabase, accessToken, customerId, managerCustomerId, userId, campId
    );
    syncResult.ads += adsResult.count;
    if (adsResult.error) syncResult.errors.push(adsResult.error);
  }

  return syncResult;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const action = body.action as string || "full_sync";

    if (action === "scheduled_sync") {
      console.log("[CRON] Starting scheduled sync for all active Google Ads accounts");
      
      // Get all active Google Ads accounts
      const { data: accounts, error: accountsError } = await supabase
        .from("google_ads_accounts")
        .select("*")
        .eq("is_active", true);

      if (accountsError || !accounts || accounts.length === 0) {
        console.log("[CRON] No active accounts found:", accountsError?.message);
        return new Response(JSON.stringify({ success: true, message: "No active Google Ads accounts", users_synced: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[CRON] Found ${accounts.length} active account(s) to sync`);
      const results: { userId: string; customerId: string; success: boolean; campaigns?: number; error?: string }[] = [];

      for (const account of accounts) {
        const userId = account.user_id;
        const customerId = account.customer_id;
        try {
          if (!account.refresh_token) {
            results.push({ userId, customerId, success: false, error: "No refresh token" });
            continue;
          }

          // Always refresh token for cron (tokens expire after 1h)
          const newToken = await refreshAccessToken(account.refresh_token);
          if (!newToken) {
            results.push({ userId, customerId, success: false, error: "Token refresh failed" });
            continue;
          }

          // Update token in DB
          await supabase.from("google_ads_accounts").update({
            access_token: newToken,
            token_expires_at: new Date(Date.now() + 3600000).toISOString(),
          }).eq("id", account.id);

          // Perform full sync
          const syncResult = await performFullSync(supabase, newToken, customerId, undefined, userId);
          
          console.log(`[CRON] User ${userId} synced: ${syncResult.campaigns} campaigns, ${syncResult.keywords} keywords, ${syncResult.ads} ads`);
          results.push({ userId, customerId, success: true, campaigns: syncResult.campaigns });
        } catch (error) {
          console.error(`[CRON] Failed for user ${userId}:`, error);
          results.push({ userId, customerId, success: false, error: String(error) });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`[CRON] Completed: ${successCount}/${results.length} accounts synced successfully`);

      return new Response(JSON.stringify({ success: true, users_synced: successCount, total_accounts: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For non-scheduled actions, require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Session expired. Please sign in again.", code: "SESSION_EXPIRED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const campaignId = body.campaign_id as string | undefined;

    // Get Google Ads connection
    const { data: connection } = await supabase
      .from("user_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("connection_type", "google_ads")
      .eq("status", "connected")
      .maybeSingle();

    if (!connection?.access_token) {
      return new Response(JSON.stringify({ error: "Google Ads not connected.", code: "NOT_CONNECTED" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = connection.access_token as string;
    if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
      const newToken = await refreshAccessToken(connection.refresh_token || "");
      if (!newToken) {
        return new Response(JSON.stringify({ error: "Token refresh failed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accessToken = newToken;
      await supabase.from("user_connections").update({
        access_token: newToken,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      }).eq("id", connection.id);
    }

    const customerId = connection.account_id as string;
    const metadata = connection.metadata as Record<string, unknown> || {};
    const managerCustomerId = metadata.manager_customer_id as string | undefined;

    // =============================================
    // ACTION: List accessible Google Ads accounts
    // =============================================
    if (action === "list_accounts") {
      console.log(`[SYNC] Listing accessible accounts for user ${userId}`);
      try {
        // Use customerService to list accessible customers
        const listResponse = await fetch(
          `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN || "",
            },
          }
        );

        if (!listResponse.ok) {
          const errorText = await listResponse.text();
          console.error("[SYNC] listAccessibleCustomers failed:", errorText);
          return new Response(JSON.stringify({ error: "Failed to list accounts", details: errorText }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const listData = await listResponse.json();
        const resourceNames = listData.resourceNames || [];
        
        // Extract customer IDs from resource names (format: "customers/1234567890")
        const customerIds = resourceNames.map((rn: string) => rn.replace("customers/", ""));
        
        // Get details for each customer
        const accountDetails: { customerId: string; name: string; isManager: boolean; currencyCode: string; timeZone: string }[] = [];
        
        for (const custId of customerIds) {
          try {
            const detailResponse = await fetch(
              `${GOOGLE_ADS_API_BASE}/customers/${custId}`,
              {
                method: "GET",
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN || "",
                  "login-customer-id": custId,
                },
              }
            );
            
            if (detailResponse.ok) {
              const detail = await detailResponse.json();
              accountDetails.push({
                customerId: custId,
                name: detail.descriptiveName || `Account ${custId}`,
                isManager: detail.manager || false,
                currencyCode: detail.currencyCode || "",
                timeZone: detail.timeZone || "",
              });
            } else {
              // May not have access to read details, still list it
              accountDetails.push({
                customerId: custId,
                name: `Account ${custId}`,
                isManager: false,
                currencyCode: "",
                timeZone: "",
              });
            }
          } catch (e) {
            console.warn(`[SYNC] Failed to get details for ${custId}:`, e);
            accountDetails.push({
              customerId: custId,
              name: `Account ${custId}`,
              isManager: false,
              currencyCode: "",
              timeZone: "",
            });
          }
        }

        return new Response(JSON.stringify({ success: true, accounts: accountDetails }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("[SYNC] List accounts error:", error);
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // =============================================
    // ACTION: Select account (save chosen customer ID)
    // =============================================
    if (action === "select_account") {
      const selectedCustomerId = body.customer_id as string;
      const selectedManagerId = body.manager_customer_id as string | undefined;
      const accountName = body.account_name as string | undefined;
      
      if (!selectedCustomerId) {
        return new Response(JSON.stringify({ error: "customer_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[SYNC] Selecting account ${selectedCustomerId} for user ${userId}`);

      const { error: updateError } = await supabase
        .from("user_connections")
        .update({
          account_id: selectedCustomerId,
          metadata: { 
            ...metadata,
            manager_customer_id: selectedManagerId || null,
            account_name: accountName || null,
          },
        })
        .eq("id", connection.id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: `Account ${selectedCustomerId} selected` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!customerId || customerId === "pending") {
      return new Response(JSON.stringify({ error: "No Google Ads account selected. Please select an account first.", code: "NO_ACCOUNT" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "full_sync") {
      const syncResult = await performFullSync(supabase, accessToken, customerId, managerCustomerId, userId);

      await supabase.from("sync_status").upsert({
        user_id: userId,
        last_full_sync_at: new Date().toISOString(),
        last_full_sync_status: syncResult.errors.length > 0 ? "partial" : "success",
        last_full_sync_error: syncResult.errors.length > 0 ? syncResult.errors.join("; ") : null,
        total_campaigns: syncResult.campaigns,
        total_keywords: syncResult.keywords,
        total_ads: syncResult.ads,
      }, { onConflict: "user_id" });

      return new Response(JSON.stringify({ success: true, ...syncResult, message: `Sync: ${syncResult.campaigns} campagnes, ${syncResult.keywords} mots-clés, ${syncResult.ads} annonces` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_campaign" && campaignId) {
      const keywordsResult = await syncCampaignKeywords(supabase, accessToken, customerId, managerCustomerId, userId, campaignId);
      const adsResult = await syncCampaignAds(supabase, accessToken, customerId, managerCustomerId, userId, campaignId);

      return new Response(JSON.stringify({ success: true, keywords: keywordsResult.count, ads: adsResult.count, errors: [keywordsResult.error, adsResult.error].filter(Boolean) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_synced_data") {
      const { data: campaigns } = await supabase.from("campaigns_sync").select("*").eq("user_id", userId).order("spend_7d", { ascending: false });
      const { data: syncStatus } = await supabase.from("sync_status").select("*").eq("user_id", userId).maybeSingle();

      return new Response(JSON.stringify({ success: true, campaigns: campaigns || [], syncStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_campaign_details" && campaignId) {
      const { data: campaignSync } = await supabase.from("campaigns_sync").select("*").eq("user_id", userId).eq("google_campaign_id", campaignId).maybeSingle();
      if (!campaignSync) {
        return new Response(JSON.stringify({ error: "Campaign not found.", keywords: [], ads: [] }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: keywords } = await supabase.from("keywords_sync").select("*").eq("campaign_sync_id", campaignSync.id).order("clicks", { ascending: false });
      const { data: ads } = await supabase.from("ads_sync").select("*").eq("campaign_sync_id", campaignSync.id).order("clicks", { ascending: false });

      // For PMax campaigns, also fetch asset groups & assets from the API
      let pmaxAssets = null;
      if (campaignSync.advertising_channel_type === "PERFORMANCE_MAX") {
        try {
          // Fetch asset groups
          const assetGroupQuery = `
            SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.ad_strength,
              asset_group.primary_status, asset_group.primary_status_reasons
            FROM asset_group WHERE campaign.id = ${campaignId}
          `;
          const agResult = await executeGAQLQuery(accessToken, customerId, assetGroupQuery, managerCustomerId);

          // Fetch asset group assets with details
          const assetGroupAssetsQuery = `
            SELECT asset_group_asset.asset_group, asset_group_asset.asset, asset_group_asset.field_type,
              asset_group_asset.status, asset_group_asset.performance_label,
              asset.id, asset.name, asset.type, asset.text_asset.text, asset.image_asset.full_size.url,
              asset.final_url_field_value
            FROM asset_group_asset WHERE campaign.id = ${campaignId}
          `;
          const agaResult = await executeGAQLQuery(accessToken, customerId, assetGroupAssetsQuery, managerCustomerId);

          // Fetch asset group listing group filters (search themes)
          const listingGroupQuery = `
            SELECT asset_group_listing_group_filter.asset_group,
              asset_group_listing_group_filter.type,
              asset_group_listing_group_filter.case_value.product_channel.channel,
              asset_group_listing_group_filter.case_value.product_type.value
            FROM asset_group_listing_group_filter WHERE campaign.id = ${campaignId}
          `;
          const lgResult = await executeGAQLQuery(accessToken, customerId, listingGroupQuery, managerCustomerId);

          // Fetch search themes for asset groups
          const searchThemeQuery = `
            SELECT asset_group_signal.asset_group, asset_group_signal.search_theme.text
            FROM asset_group_signal WHERE campaign.id = ${campaignId}
          `;
          const stResult = await executeGAQLQuery(accessToken, customerId, searchThemeQuery, managerCustomerId);

          // Process asset groups
          const assetGroups = (agResult.results as any[]).map((r: any) => {
            const ag = r.assetGroup;
            return {
              id: ag.id,
              name: ag.name,
              status: ag.status,
              adStrength: ag.adStrength,
              primaryStatus: ag.primaryStatus,
              primaryStatusReasons: ag.primaryStatusReasons,
            };
          });

          // Process assets by field type
          const assetsByGroup: Record<string, { headlines: string[]; descriptions: string[]; longHeadlines: string[]; images: string[]; logos: string[]; videos: string[]; callToActions: string[]; businessName: string | null; finalUrls: string[] }> = {};
          for (const r of (agaResult.results as any[])) {
            const aga = r.assetGroupAsset;
            const asset = r.asset;
            const groupId = aga.assetGroup?.split("/").pop() || "unknown";
            if (!assetsByGroup[groupId]) {
              assetsByGroup[groupId] = { headlines: [], descriptions: [], longHeadlines: [], images: [], logos: [], videos: [], callToActions: [], businessName: null, finalUrls: [] };
            }
            const g = assetsByGroup[groupId];
            const fieldType = aga.fieldType;
            const text = asset?.textAsset?.text;
            const imageUrl = asset?.imageAsset?.fullSize?.url;
            
            if (fieldType === "HEADLINE" && text) g.headlines.push(text);
            else if (fieldType === "DESCRIPTION" && text) g.descriptions.push(text);
            else if (fieldType === "LONG_HEADLINE" && text) g.longHeadlines.push(text);
            else if (fieldType === "MARKETING_IMAGE" && imageUrl) g.images.push(imageUrl);
            else if (fieldType === "LOGO" && imageUrl) g.logos.push(imageUrl);
            else if (fieldType === "YOUTUBE_VIDEO") g.videos.push(asset?.name || "Video");
            else if (fieldType === "CALL_TO_ACTION_SELECTION" && text) g.callToActions.push(text);
            else if (fieldType === "BUSINESS_NAME" && text) g.businessName = text;
          }

          // Process search themes
          const searchThemes: Record<string, string[]> = {};
          for (const r of (stResult.results as any[])) {
            const groupId = r.assetGroupSignal?.assetGroup?.split("/").pop() || "unknown";
            const theme = r.assetGroupSignal?.searchTheme?.text;
            if (!searchThemes[groupId]) searchThemes[groupId] = [];
            if (theme) searchThemes[groupId].push(theme);
          }

          pmaxAssets = {
            assetGroups: assetGroups.map((ag: any) => ({
              ...ag,
              assets: assetsByGroup[ag.id] || { headlines: [], descriptions: [], longHeadlines: [], images: [], logos: [], videos: [], callToActions: [], businessName: null, finalUrls: [] },
              searchThemes: searchThemes[ag.id] || [],
            })),
          };
        } catch (pmaxErr) {
          console.error("[SYNC] PMax assets fetch error:", pmaxErr);
        }
      }

      return new Response(JSON.stringify({ success: true, campaign: campaignSync, keywords: keywords || [], ads: ads || [], pmaxAssets }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_history") {
      const days = (body.days as number) || 30;
      const historyQuery = `
        SELECT campaign.id, segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value
        FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date DURING LAST_${days}_DAYS ORDER BY segments.date DESC
      `;

      const historyResult = await executeGAQLQuery(accessToken, customerId, historyQuery, managerCustomerId);
      if (!historyResult.success) {
        return new Response(JSON.stringify({ error: `History sync failed: ${historyResult.error}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let insertedCount = 0;
      for (const row of historyResult.results as Record<string, unknown>[]) {
        const campaign = row.campaign as Record<string, unknown>;
        const segments = row.segments as Record<string, unknown>;
        const metrics = row.metrics as Record<string, unknown> || {};
        const campId = String(campaign.id);
        const date = String(segments.date);

        const { data: campaignSync } = await supabase.from("campaigns_sync").select("id").eq("user_id", userId).eq("google_campaign_id", campId).maybeSingle();
        if (!campaignSync) continue;

        const spend = Number(metrics.costMicros || 0) / 1000000;
        const clicks = Number(metrics.clicks || 0);
        const impressions = Number(metrics.impressions || 0);
        const conversions = Number(metrics.conversions || 0);
        const revenue = Number(metrics.conversionsValue || 0);

        const { error } = await supabase.from("performance_history").upsert({
          user_id: userId, campaign_sync_id: campaignSync.id, date, spend, clicks, impressions, conversions, revenue,
          ctr: impressions > 0 ? clicks / impressions : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          roas: spend > 0 ? revenue / spend : 0,
          cpa: conversions > 0 ? spend / conversions : null,
        }, { onConflict: "campaign_sync_id,date" });
        if (!error) insertedCount++;
      }

      return new Response(JSON.stringify({ success: true, records: insertedCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[SYNC] Unexpected error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// deno-lint-ignore no-explicit-any
async function syncCampaignKeywords(
  supabase: any, accessToken: string, customerId: string, managerCustomerId: string | undefined, userId: string, campaignId: string
): Promise<{ count: number; error?: string }> {
  try {
    const { data: campaignSync } = await supabase.from("campaigns_sync").select("id").eq("user_id", userId).eq("google_campaign_id", campaignId).maybeSingle();
    if (!campaignSync) return { count: 0, error: `Campaign ${campaignId} not found in sync table` };

    const criterionQuery = `
      SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        ad_group_criterion.status, ad_group_criterion.system_serving_status, ad_group_criterion.approval_status,
        ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr,
        ad_group_criterion.effective_cpc_bid_micros, ad_group_criterion.cpc_bid_micros,
        ad_group_criterion.position_estimates.first_page_cpc_micros, ad_group_criterion.position_estimates.top_of_page_cpc_micros,
        ad_group.id, ad_group.name
      FROM ad_group_criterion
      WHERE ad_group_criterion.type = 'KEYWORD' AND campaign.id = ${campaignId} AND ad_group_criterion.status != 'REMOVED'
    `;

    const metricsQuery = `
      SELECT ad_group_criterion.criterion_id, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM keyword_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_7_DAYS
    `;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN || "",
      "Content-Type": "application/json",
    };
    if (managerCustomerId && managerCustomerId !== customerId) headers["login-customer-id"] = managerCustomerId;

    const [criterionResponse, metricsResponse] = await Promise.all([
      fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: criterionQuery }) }),
      fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: metricsQuery }) }),
    ]);

    if (!criterionResponse.ok) {
      const errorText = await criterionResponse.text();
      return { count: 0, error: `Keywords sync failed: ${errorText}` };
    }

    const criterionData = await criterionResponse.json();
    const criterionResults = criterionData.results || [];

    const metricsMap = new Map<string, { clicks: number; impressions: number; costMicros: number; conversions: number; conversionsValue: number }>();
    if (metricsResponse.ok) {
      const metricsData = await metricsResponse.json();
      for (const row of (metricsData.results || []) as Record<string, unknown>[]) {
        const criterion = row.adGroupCriterion as Record<string, unknown> || {};
        const metrics = row.metrics as Record<string, unknown> || {};
        const kwId = String(criterion.criterionId);
        const existing = metricsMap.get(kwId) || { clicks: 0, impressions: 0, costMicros: 0, conversions: 0, conversionsValue: 0 };
        existing.clicks += Number(metrics.clicks || 0);
        existing.impressions += Number(metrics.impressions || 0);
        existing.costMicros += Number(metrics.costMicros || 0);
        existing.conversions += Number(metrics.conversions || 0);
        existing.conversionsValue += Number(metrics.conversionsValue || 0);
        metricsMap.set(kwId, existing);
      }
    } else {
      await metricsResponse.text();
    }

    let count = 0;
    for (const row of criterionResults as Record<string, unknown>[]) {
      const criterion = row.adGroupCriterion as Record<string, unknown>;
      const adGroup = row.adGroup as Record<string, unknown>;
      const keyword = criterion.keyword as Record<string, unknown> || {};
      const qualityInfo = criterion.qualityInfo as Record<string, unknown> || {};
      const positionEstimates = criterion.positionEstimates as Record<string, unknown> || {};
      const kwId = String(criterion.criterionId);
      const kwMetrics = metricsMap.get(kwId) || { clicks: 0, impressions: 0, costMicros: 0, conversions: 0, conversionsValue: 0 };

      const { error } = await supabase.from("keywords_sync").upsert({
        user_id: userId, campaign_sync_id: campaignSync.id, google_keyword_id: kwId,
        google_ad_group_id: adGroup.id ? String(adGroup.id) : null, ad_group_name: adGroup.name ? String(adGroup.name) : null,
        keyword_text: String(keyword.text || ""), match_type: keyword.matchType ? String(keyword.matchType) : null,
        status: criterion.status ? String(criterion.status) : null,
        quality_score: qualityInfo.qualityScore ? Number(qualityInfo.qualityScore) : null,
        quality_score_creative: qualityInfo.creativeQualityScore ? String(qualityInfo.creativeQualityScore) : null,
        quality_score_landing: qualityInfo.postClickQualityScore ? String(qualityInfo.postClickQualityScore) : null,
        quality_score_expected_ctr: qualityInfo.searchPredictedCtr ? String(qualityInfo.searchPredictedCtr) : null,
        cpc_bid_micros: criterion.cpcBidMicros ? Number(criterion.cpcBidMicros) : null,
        effective_cpc_bid_micros: criterion.effectiveCpcBidMicros ? Number(criterion.effectiveCpcBidMicros) : null,
        system_serving_status: criterion.systemServingStatus ? String(criterion.systemServingStatus) : null,
        approval_status: criterion.approvalStatus ? String(criterion.approvalStatus) : null,
        first_page_cpc_micros: positionEstimates.firstPageCpcMicros ? Number(positionEstimates.firstPageCpcMicros) : null,
        top_of_page_cpc_micros: positionEstimates.topOfPageCpcMicros ? Number(positionEstimates.topOfPageCpcMicros) : null,
        clicks: kwMetrics.clicks, impressions: kwMetrics.impressions, cost_micros: kwMetrics.costMicros,
        conversions: kwMetrics.conversions, conversions_value: kwMetrics.conversionsValue,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,google_keyword_id" });
      if (!error) count++;
    }

    return { count };
  } catch (error) {
    return { count: 0, error: String(error) };
  }
}

// deno-lint-ignore no-explicit-any
async function syncCampaignAds(
  supabase: any, accessToken: string, customerId: string, managerCustomerId: string | undefined, userId: string, campaignId: string
): Promise<{ count: number; error?: string }> {
  try {
    const { data: campaignSync } = await supabase.from("campaigns_sync").select("id").eq("user_id", userId).eq("google_campaign_id", campaignId).maybeSingle();
    if (!campaignSync) return { count: 0, error: `Campaign ${campaignId} not found in sync table` };

    const adsMetadataQuery = `
      SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2,
        ad_group_ad.ad_strength, ad_group_ad.status, ad_group_ad.policy_summary.policy_topic_entries,
        ad_group.id, ad_group.name
      FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED'
    `;

    const adsMetricsQuery = `
      SELECT ad_group_ad.ad.id, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED' AND segments.date DURING LAST_7_DAYS
    `;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN || "",
      "Content-Type": "application/json",
    };
    if (managerCustomerId && managerCustomerId !== customerId) headers["login-customer-id"] = managerCustomerId;

    const metadataResponse = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: adsMetadataQuery }) });
    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      return { count: 0, error: `Ads sync failed: ${errorText}` };
    }

    const metadataData = await metadataResponse.json();
    const metadataResults = metadataData.results || [];

    const adsMetricsMap = new Map<string, { clicks: number; impressions: number; costMicros: number; conversions: number; conversionsValue: number }>();
    try {
      const metricsResponse = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: adsMetricsQuery }) });
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        for (const row of (metricsData.results || []) as Record<string, unknown>[]) {
          const adGroupAd = row.adGroupAd as Record<string, unknown> || {};
          const ad = adGroupAd.ad as Record<string, unknown> || {};
          const metrics = row.metrics as Record<string, unknown> || {};
          const adId = String(ad.id);
          const existing = adsMetricsMap.get(adId) || { clicks: 0, impressions: 0, costMicros: 0, conversions: 0, conversionsValue: 0 };
          existing.clicks += Number(metrics.clicks || 0);
          existing.impressions += Number(metrics.impressions || 0);
          existing.costMicros += Number(metrics.costMicros || 0);
          existing.conversions += Number(metrics.conversions || 0);
          existing.conversionsValue += Number(metrics.conversionsValue || 0);
          adsMetricsMap.set(adId, existing);
        }
      } else { await metricsResponse.text(); }
    } catch (e) { console.warn("[SYNC] Ads metrics failed:", e); }

    let count = 0;
    for (const row of metadataResults as Record<string, unknown>[]) {
      const adGroupAd = row.adGroupAd as Record<string, unknown>;
      const adGroup = row.adGroup as Record<string, unknown>;
      const ad = adGroupAd.ad as Record<string, unknown> || {};
      const rsa = ad.responsiveSearchAd as Record<string, unknown> || {};
      const policySummary = adGroupAd.policySummary as Record<string, unknown> || {};
      const adId = String(ad.id);
      const adMetrics = adsMetricsMap.get(adId) || { clicks: 0, impressions: 0, costMicros: 0, conversions: 0, conversionsValue: 0 };

      const headlines = (rsa.headlines as Array<Record<string, unknown>> || []).map(h => ({ text: h.text || "", pinnedField: h.pinnedField || null, assetPerformanceLabel: h.assetPerformanceLabel || null }));
      const descriptions = (rsa.descriptions as Array<Record<string, unknown>> || []).map(d => ({ text: d.text || "", pinnedField: d.pinnedField || null, assetPerformanceLabel: d.assetPerformanceLabel || null }));

      const { error } = await supabase.from("ads_sync").upsert({
        user_id: userId, campaign_sync_id: campaignSync.id, google_ad_id: adId,
        google_ad_group_id: adGroup.id ? String(adGroup.id) : null, ad_group_name: adGroup.name ? String(adGroup.name) : null,
        ad_type: ad.type ? String(ad.type) : null, status: adGroupAd.status ? String(adGroupAd.status) : null,
        headlines, descriptions, final_urls: ad.finalUrls as string[] || [],
        path1: rsa.path1 ? String(rsa.path1) : null, path2: rsa.path2 ? String(rsa.path2) : null,
        ad_strength: adGroupAd.adStrength ? String(adGroupAd.adStrength) : null,
        ad_strength_reasons: null, policy_summary: policySummary.policyTopicEntries || null,
        clicks: adMetrics.clicks, impressions: adMetrics.impressions, cost_micros: adMetrics.costMicros,
        conversions: adMetrics.conversions, conversions_value: adMetrics.conversionsValue,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,google_ad_id" });
      if (!error) count++;
    }

    return { count };
  } catch (error) {
    return { count: 0, error: String(error) };
  }
}
