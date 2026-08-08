import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v22";
const cut = (s: string, n: number): string => s.length > n ? s.slice(0, n) : s;

// ─── Helpers ─────────────────────────────────────────────

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

async function mutateResource(
  accessToken: string, customerId: string, resource: string, operations: unknown[], managerCustomerId?: string
) {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "",
    "Content-Type": "application/json",
  };
  if (managerCustomerId && managerCustomerId !== customerId) headers["login-customer-id"] = managerCustomerId;

  const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/${resource}:mutate`, {
    method: "POST", headers, body: JSON.stringify({ operations }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[PMAX-OPT] mutate ${resource} ERROR (${response.status}):`, errorText.slice(0, 2000));
    try {
      const errObj = JSON.parse(errorText);
      const details = errObj?.error?.details;
      if (details) console.error(`[PMAX-OPT] Error details:`, JSON.stringify(details).slice(0, 2000));
    } catch (_) { /* not JSON */ }
    throw new Error(`mutate ${resource} failed: ${errorText.slice(0, 500)}`);
  }
  return await response.json();
}

async function executeGAQLQuery(
  accessToken: string, customerId: string, query: string, managerCustomerId?: string
): Promise<unknown[]> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "",
    "Content-Type": "application/json",
  };
  if (managerCustomerId && managerCustomerId !== customerId) headers["login-customer-id"] = managerCustomerId;

  const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, {
    method: "POST", headers, body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[PMAX-OPT] GAQL failed:", errorText);
    return [];
  }
  const data = await response.json();
  return data.results || [];
}

async function downloadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return base64Encode(new Uint8Array(buffer));
  } catch (e) {
    console.warn(`[PMAX-OPT] Image download failed: ${url}`, e);
    return null;
  }
}

async function getAuthAndConnection(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userError } = await anonClient.auth.getUser();
  if (userError || !user) throw new Error("Unauthorized");

  const { data: connection } = await supabase
    .from("user_connections")
    .select("*")
    .eq("user_id", user.id)
    .eq("connection_type", "google_ads")
    .eq("status", "connected")
    .maybeSingle();

  if (!connection?.access_token || !connection.account_id) throw new Error("Google Ads not connected");

  let accessToken = connection.access_token as string;
  if (connection.token_expires_at && new Date(connection.token_expires_at as string) < new Date()) {
    const newToken = await refreshAccessToken(connection.refresh_token || "");
    if (!newToken) throw new Error("Token refresh failed");
    accessToken = newToken;
    await supabase.from("user_connections").update({
      access_token: newToken, token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    }).eq("id", connection.id);
  }

  const customerId = (connection.account_id as string).replace(/-/g, "");
  const metadata = connection.metadata as Record<string, unknown> || {};
  const managerCustomerId = (metadata.manager_customer_id as string || "").replace(/-/g, "") || undefined;

  return { supabase, user, accessToken, customerId, managerCustomerId };
}

// ─── AI Generation ───────────────────────────────────────

async function generateWithAI(prompt: string, systemPrompt: string): Promise<string> {
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI generation failed: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseJSON(text: string): unknown {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// ─── Fetch current PMax state ────────────────────────────

async function fetchPmaxState(accessToken: string, customerId: string, campaignId: string, managerCustomerId?: string) {
  const [agResults, agaResults, stResults, campaignAssetResults, audienceResults] = await Promise.all([
    executeGAQLQuery(accessToken, customerId, `
      SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.ad_strength,
        asset_group.final_urls, asset_group.resource_name, asset_group.path1, asset_group.path2
      FROM asset_group WHERE campaign.id = ${campaignId}
    `, managerCustomerId),
    executeGAQLQuery(accessToken, customerId, `
      SELECT asset_group_asset.asset_group, asset_group_asset.field_type, asset_group_asset.status,
        asset.id, asset.text_asset.text, asset.image_asset.full_size.url,
        asset.youtube_video_asset.youtube_video_id, asset.youtube_video_asset.youtube_video_title,
        asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2,
        asset.call_asset.phone_number, asset.call_asset.country_code,
        asset.lead_form_asset.headline, asset.lead_form_asset.description,
        asset.callout_asset.callout_text,
        asset.promotion_asset.promotion_target, asset.promotion_asset.discount_modifier,
        asset.price_asset.type, asset.price_asset.price_qualifier,
        asset.structured_snippet_asset.header, asset.structured_snippet_asset.values
      FROM asset_group_asset WHERE campaign.id = ${campaignId} AND asset_group_asset.status != 'REMOVED'
    `, managerCustomerId),
    executeGAQLQuery(accessToken, customerId, `
      SELECT asset_group_signal.asset_group, asset_group_signal.search_theme.text
      FROM asset_group_signal WHERE campaign.id = ${campaignId}
    `, managerCustomerId),
    executeGAQLQuery(accessToken, customerId, `
      SELECT campaign.id, campaign_asset.asset, campaign_asset.field_type, campaign_asset.status,
        asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2,
        asset.call_asset.phone_number, asset.call_asset.country_code,
        asset.lead_form_asset.headline,
        asset.callout_asset.callout_text,
        asset.promotion_asset.promotion_target, asset.promotion_asset.discount_modifier,
        asset.price_asset.type,
        asset.structured_snippet_asset.header, asset.structured_snippet_asset.values
      FROM campaign_asset WHERE campaign.id = ${campaignId} AND campaign_asset.status != 'REMOVED'
    `, managerCustomerId),
    // Fetch audience signals (audiences linked to asset groups)
    executeGAQLQuery(accessToken, customerId, `
      SELECT asset_group_signal.resource_name, asset_group_signal.asset_group,
        asset_group_signal.audience.audience
      FROM asset_group_signal WHERE campaign.id = ${campaignId}
    `, managerCustomerId),
  ]);

  // Parse asset groups
  const assetGroups = (agResults as any[]).map((r: any) => ({
    id: String(r.assetGroup?.id),
    name: r.assetGroup?.name,
    status: r.assetGroup?.status,
    adStrength: r.assetGroup?.adStrength,
    resourceName: r.assetGroup?.resourceName,
    finalUrls: r.assetGroup?.finalUrls || [],
    path1: r.assetGroup?.path1 || "",
    path2: r.assetGroup?.path2 || "",
  }));

  // Parse assets by group
  const assetsByGroup: Record<string, any> = {};
  for (const r of (agaResults as any[])) {
    const groupId = r.assetGroupAsset?.assetGroup?.split("/").pop() || "unknown";
    if (!assetsByGroup[groupId]) {
      assetsByGroup[groupId] = {
        headlines: [], descriptions: [], longHeadlines: [], images: [], logos: [],
        videos: [], businessName: null, sitelinks: [], callouts: [], phones: [], leadForms: [],
        promotions: [], prices: [], snippets: [],
      };
    }
    const g = assetsByGroup[groupId];
    const ft = r.assetGroupAsset?.fieldType;
    const text = r.asset?.textAsset?.text;
    const imgUrl = r.asset?.imageAsset?.fullSize?.url;
    const videoId = r.asset?.youtubeVideoAsset?.youtubeVideoId;

    if (ft === "HEADLINE" && text) g.headlines.push(text);
    else if (ft === "DESCRIPTION" && text) g.descriptions.push(text);
    else if (ft === "LONG_HEADLINE" && text) g.longHeadlines.push(text);
    else if (ft === "MARKETING_IMAGE" && imgUrl) g.images.push(imgUrl);
    else if (ft === "LOGO" && imgUrl) g.logos.push(imgUrl);
    else if (ft === "YOUTUBE_VIDEO" && videoId) g.videos.push(videoId);
    else if (ft === "BUSINESS_NAME" && text) g.businessName = text;
    else if (ft === "PROMOTION") g.promotions.push(r.asset?.promotionAsset || {});
    else if (ft === "PRICE") g.prices.push(r.asset?.priceAsset || {});
    else if (ft === "STRUCTURED_SNIPPET") g.snippets.push(r.asset?.structuredSnippetAsset || {});
  }

  // Parse search themes
  const searchThemes: Record<string, string[]> = {};
  for (const r of (stResults as any[])) {
    const groupId = r.assetGroupSignal?.assetGroup?.split("/").pop() || "unknown";
    if (!searchThemes[groupId]) searchThemes[groupId] = [];
    const theme = r.assetGroupSignal?.searchTheme?.text;
    if (theme) searchThemes[groupId].push(theme);
  }

  // Parse campaign-level assets (sitelinks, phone, lead form, callouts)
  const campaignAssets = {
    sitelinks: [] as any[],
    phones: [] as any[],
    leadForms: [] as any[],
    callouts: [] as string[],
    promotions: [] as any[],
    prices: [] as any[],
    snippets: [] as any[],
  };
  for (const r of (campaignAssetResults as any[])) {
    const ft = r.campaignAsset?.fieldType;
    if (ft === "SITELINK" && r.asset?.sitelinkAsset?.linkText) {
      campaignAssets.sitelinks.push({
        text: r.asset.sitelinkAsset.linkText,
        finalUrls: r.asset.sitelinkAsset.finalUrls,
      });
    }
    if (ft === "CALL" && r.asset?.callAsset?.phoneNumber) {
      campaignAssets.phones.push({
        number: r.asset.callAsset.phoneNumber,
        country: r.asset.callAsset.countryCode,
      });
    }
    if (ft === "LEAD_FORM" && r.asset?.leadFormAsset?.headline) {
      campaignAssets.leadForms.push({
        headline: r.asset.leadFormAsset.headline,
        description: r.asset.leadFormAsset.description,
      });
    }
    if (ft === "CALLOUT" && r.asset?.calloutAsset?.calloutText) {
      campaignAssets.callouts.push(r.asset.calloutAsset.calloutText);
    }
    if (ft === "PROMOTION") campaignAssets.promotions.push(r.asset?.promotionAsset || {});
    if (ft === "PRICE") campaignAssets.prices.push(r.asset?.priceAsset || {});
    if (ft === "STRUCTURED_SNIPPET") campaignAssets.snippets.push(r.asset?.structuredSnippetAsset || {});
  }

  // Parse audience signals (separate from search themes)
  const audienceSignals: Record<string, string[]> = {};
  for (const r of (audienceResults as any[])) {
    const groupId = r.assetGroupSignal?.assetGroup?.split("/").pop() || "unknown";
    if (!audienceSignals[groupId]) audienceSignals[groupId] = [];
    const audienceRN = r.assetGroupSignal?.audience?.audience;
    if (audienceRN) audienceSignals[groupId].push(audienceRN);
  }

  // Fetch audience details if any exist
  const allAudienceRNs = [...new Set(Object.values(audienceSignals).flat())];
  let audienceDetails: Record<string, { name: string; description: string }> = {};
  if (allAudienceRNs.length > 0) {
    try {
      const audienceDetailResults = await executeGAQLQuery(accessToken, customerId, `
        SELECT audience.resource_name, audience.name, audience.description, audience.status
        FROM audience WHERE audience.status = 'ENABLED'
      `, managerCustomerId);
      for (const r of (audienceDetailResults as any[])) {
        const rn = r.audience?.resourceName;
        if (rn) {
          audienceDetails[rn] = {
            name: r.audience?.name || "Unknown",
            description: r.audience?.description || "",
          };
        }
      }
    } catch (e) {
      console.warn("[PMAX-OPT] Failed to fetch audience details:", e);
    }
  }

  return {
    assetGroups: assetGroups.map(ag => ({
      ...ag,
      assets: assetsByGroup[ag.id] || { headlines: [], descriptions: [], longHeadlines: [], images: [], logos: [], businessName: null },
      searchThemes: searchThemes[ag.id] || [],
      audienceSignals: (audienceSignals[ag.id] || []).map(rn => ({
        resourceName: rn,
        name: audienceDetails[rn]?.name || rn.split("/").pop() || "Unknown",
        description: audienceDetails[rn]?.description || "",
      })),
    })),
    campaignAssets,
  };
}

// ─── Main Handler ────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { supabase, user, accessToken, customerId, managerCustomerId } = await getAuthAndConnection(req);
    const body = await req.json();
    const action = body.action as string;
    const campaignId = body.campaignId as string;

    if (!campaignId) throw new Error("campaignId required");

    // Get campaign info
    const { data: campaignSync } = await supabase
      .from("campaigns_sync")
      .select("*")
      .eq("user_id", user.id)
      .eq("google_campaign_id", campaignId)
      .maybeSingle();

    if (!campaignSync) throw new Error("Campaign not found");

    const campaignResourceName = `customers/${customerId}/campaigns/${campaignId}`;
    const results: { action: string; success: boolean; details: string }[] = [];
    const warnings: string[] = [];

    // ═══════════════════════════════════════════════════════
    // ACTION: analyze - Get current state and AI recommendations
    // ═══════════════════════════════════════════════════════
    if (action === "analyze") {
      console.log(`[PMAX-OPT] Analyzing campaign ${campaignId}`);
      const state = await fetchPmaxState(accessToken, customerId, campaignId, managerCustomerId);

      const ag = state.assetGroups[0];
      const analysis = {
        campaignName: campaignSync.name,
        status: campaignSync.status,
        adStrength: ag?.adStrength || "UNKNOWN",
        headlines: ag?.assets?.headlines?.length || 0,
        maxHeadlines: 15,
        descriptions: ag?.assets?.descriptions?.length || 0,
        maxDescriptions: 5,
        longHeadlines: ag?.assets?.longHeadlines?.length || 0,
        maxLongHeadlines: 5,
        images: ag?.assets?.images?.length || 0,
        maxImages: 20,
        logos: ag?.assets?.logos?.length || 0,
        maxLogos: 5,
        videos: ag?.assets?.videos?.length || 0,
        searchThemes: ag?.searchThemes?.length || 0,
        maxSearchThemes: 25,
        sitelinks: state.campaignAssets.sitelinks.length,
        maxSitelinks: 6,
        phones: state.campaignAssets.phones.length,
        leadForms: state.campaignAssets.leadForms.length,
        callouts: state.campaignAssets.callouts.length,
        maxCallouts: 10,
        audienceSignals: ag?.audienceSignals?.length || 0,
        promotions: state.campaignAssets.promotions.length + (ag?.assets?.promotions?.length || 0),
        prices: state.campaignAssets.prices.length + (ag?.assets?.prices?.length || 0),
        snippets: state.campaignAssets.snippets.length + (ag?.assets?.snippets?.length || 0),
        displayPath: ag?.path1 ? `/${ag.path1}${ag.path2 ? "/" + ag.path2 : ""}` : null,
        currentAssets: {
          headlines: ag?.assets?.headlines || [],
          descriptions: ag?.assets?.descriptions || [],
          longHeadlines: ag?.assets?.longHeadlines || [],
          searchThemes: ag?.searchThemes || [],
          sitelinks: state.campaignAssets.sitelinks,
          callouts: state.campaignAssets.callouts,
          phones: state.campaignAssets.phones,
          leadForms: state.campaignAssets.leadForms,
          promotions: state.campaignAssets.promotions,
          prices: state.campaignAssets.prices,
          snippets: state.campaignAssets.snippets,
          videos: ag?.assets?.videos || [],
          images: ag?.assets?.images?.length || 0,
          logos: ag?.assets?.logos?.length || 0,
          audienceSignals: ag?.audienceSignals || [],
        },
        assetGroupId: ag?.id,
        assetGroupResourceName: ag?.resourceName,
        finalUrl: ag?.finalUrls?.[0] || campaignSync.name,
      };

      return new Response(JSON.stringify({ success: true, analysis }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════════
    // ACTION: optimize - AI generates + applies improvements
    // ═══════════════════════════════════════════════════════
    if (action === "optimize") {
      console.log(`[PMAX-OPT] Optimizing campaign ${campaignId}`);
      const state = await fetchPmaxState(accessToken, customerId, campaignId, managerCustomerId);
      const ag = state.assetGroups[0];
      if (!ag) throw new Error("No asset group found");

      const currentAssets = ag.assets || {};
      const brandName = body.brandName || currentAssets.businessName || campaignSync.name;
      const websiteUrl = body.websiteUrl || ag.finalUrls?.[0] || "";
      const businessDescription = body.businessDescription || "";
      const language = body.language || "en";
      const optimizeOptions = body.options || {};

      // Determine what needs optimization
      const gaps = {
        needHeadlines: (currentAssets.headlines?.length || 0) < 15,
        needDescriptions: (currentAssets.descriptions?.length || 0) < 5,
        needLongHeadlines: (currentAssets.longHeadlines?.length || 0) < 5,
        needSitelinks: state.campaignAssets.sitelinks.length < 4 && optimizeOptions.sitelinks !== false,
        needCallouts: state.campaignAssets.callouts.length < 4 && optimizeOptions.callouts !== false,
        needPhone: state.campaignAssets.phones.length === 0 && (optimizeOptions.phone !== false),
        needLeadForm: state.campaignAssets.leadForms.length === 0 && optimizeOptions.leadForm,
        needImages: (currentAssets.images?.length || 0) < 3 && optimizeOptions.images,
        needSearchThemes: (ag.searchThemes?.length || 0) < 10,
        needAudienceSignal: (ag.audienceSignals?.length || 0) === 0,
        needPromotions: (state.campaignAssets.promotions.length + (currentAssets.promotions?.length || 0)) === 0 && optimizeOptions.promotions !== false,
        needPrices: (state.campaignAssets.prices.length + (currentAssets.prices?.length || 0)) === 0 && optimizeOptions.prices !== false,
        needSnippets: (state.campaignAssets.snippets.length + (currentAssets.snippets?.length || 0)) === 0 && optimizeOptions.structuredSnippets !== false,
      };

      console.log(`[PMAX-OPT] Gaps:`, JSON.stringify(gaps));

      // ── AI Generation ──
      const aiPrompt = `
Business: ${brandName}
Website: ${websiteUrl}
Description: ${businessDescription}
Language: ${language}

Current headlines (${currentAssets.headlines?.length || 0}/15): ${JSON.stringify(currentAssets.headlines || [])}
Current descriptions (${currentAssets.descriptions?.length || 0}/5): ${JSON.stringify(currentAssets.descriptions || [])}
Current long headlines (${currentAssets.longHeadlines?.length || 0}/5): ${JSON.stringify(currentAssets.longHeadlines || [])}
Current search themes (${ag.searchThemes?.length || 0}/25): ${JSON.stringify(ag.searchThemes || [])}
Current sitelinks (${state.campaignAssets.sitelinks.length}): ${JSON.stringify(state.campaignAssets.sitelinks)}
Current callouts (${state.campaignAssets.callouts.length}): ${JSON.stringify(state.campaignAssets.callouts)}
Current promotions: ${state.campaignAssets.promotions.length + (currentAssets.promotions?.length || 0)}
Current prices: ${state.campaignAssets.prices.length + (currentAssets.prices?.length || 0)}
Current structured snippets: ${state.campaignAssets.snippets.length + (currentAssets.snippets?.length || 0)}
Current audience signals (${ag.audienceSignals?.length || 0}): ${JSON.stringify(ag.audienceSignals?.map((a: any) => a.name) || [])}

Generate ONLY what's missing. Return JSON:
{
  "headlines": ["..."],          // new headlines to ADD (max 30 chars each), fill up to 15 total
  "descriptions": ["..."],       // new descriptions to ADD (max 90 chars each), fill up to 5 total
  "longHeadlines": ["..."],      // new long headlines (max 90 chars each), fill up to 5 total
  "searchThemes": ["..."],       // new search themes to ADD, fill up to 25 total
  "sitelinks": [{"text": "...", "description1": "...", "description2": "...", "finalUrl": "..."}], // max 6 total, text max 25 chars, descriptions max 35 chars
  "callouts": ["..."],           // new callouts (max 25 chars each), fill up to 10 total
  ${gaps.needPromotions ? '"promotions": [{"promotionTarget": "Free Trial", "percentOff": 100, "occasion": "NONE", "finalUrl": "https://..."}],' : ''}
  ${gaps.needPrices ? '"prices": [{"type": "SERVICES", "priceOfferings": [{"header": "Plan Name", "description": "Short desc", "price": {"currencyCode": "EUR", "amountMicros": "29000000"}, "unit": "PER_MONTH", "finalUrl": "https://..."}]}],' : ''}
  ${gaps.needSnippets ? '"structuredSnippets": [{"header": "Services", "values": ["AEO Content", "SEO Audit", "Keyword Research"]}],' : ''}
  ${gaps.needAudienceSignal ? '"audienceSignal": {"name": "Audience name for library", "customSegments": ["AI SEO tools users", "Content marketing pros"], "interests": ["Search Engine Optimization", "Digital Marketing"], "demographics": {"ageRanges": ["25-34", "35-44", "45-54"], "genders": ["all"]}},' : ''}
  ${gaps.needLeadForm ? '"leadForm": {"headline": "...", "description": "...", "fields": ["FULL_NAME", "EMAIL", "PHONE_NUMBER"]},' : ''}
  ${gaps.needPhone && body.phoneNumber ? '"phone": {"number": "' + body.phoneNumber + '", "country": "' + (body.phoneCountry || "FR") + '"},' : ''}
  "imageSearchQueries": ["..."]  // 3-5 search queries to find relevant stock images for this business
}

RULES:
- Do NOT repeat existing assets
- Headlines MUST be ≤30 characters
- Descriptions MUST be ≤90 characters
- Long headlines MUST be ≤90 characters
- Sitelink text MUST be ≤25 characters
- Callouts MUST be ≤25 characters
- Promotions: promotionTarget is the text shown (e.g. "Free Trial"), percentOff is 0-100, occasion can be NONE or a valid Google occasion
- Structured snippets: header must be one of: Amenities, Brands, Courses, Degree programs, Destinations, Featured hotels, Insurance coverage, Models, Neighborhoods, Service catalog, Shows, Styles, Types
- Prices: type must be one of: BRANDS, EVENTS, LOCATIONS, NEIGHBORHOODS, PRODUCT_CATEGORIES, PRODUCT_TIERS, SERVICE_CATEGORIES, SERVICE_TIERS, SERVICES. unit can be PER_HOUR, PER_DAY, PER_WEEK, PER_MONTH, PER_YEAR, PER_NIGHT
- Generate 2-3 promotions, 1-2 structured snippets, 1 price set with 3-5 offerings
- Write headlines, descriptions, long headlines, callouts, sitelinks in ${language === "fr" ? "French" : language === "en" ? "English" : language}
- CRITICAL: searchThemes MUST ALWAYS be written in ENGLISH regardless of the language setting. Search themes are used by Google's algorithm and must be in English.
- Be creative, persuasive, include CTAs and value props
- Sitelinks should link to different pages of the website
- audienceSignal: Generate relevant audience targeting with custom segments (search terms your ideal customers use), interests (Google affinity/in-market categories), and demographics
`;

      const aiSystemPrompt = `You are a Google Ads PMax expert. Generate high-quality ad assets.
Return ONLY valid JSON, no markdown, no explanations. Every text must respect the character limits strictly.`;

      console.log("[PMAX-OPT] Generating AI assets...");
      const aiResponse = await generateWithAI(aiPrompt, aiSystemPrompt);
      let generated: any;
      try {
        generated = parseJSON(aiResponse);
      } catch (e) {
        throw new Error(`AI returned invalid JSON: ${aiResponse.slice(0, 200)}`);
      }

      console.log("[PMAX-OPT] AI generated:", JSON.stringify({
        headlines: generated.headlines?.length,
        descriptions: generated.descriptions?.length,
        longHeadlines: generated.longHeadlines?.length,
        sitelinks: generated.sitelinks?.length,
        searchThemes: generated.searchThemes?.length,
      }));

      const assetGroupResourceName = ag.resourceName;

      // ── Add Headlines ──
      if (generated.headlines?.length > 0 && gaps.needHeadlines) {
        const toAdd = generated.headlines.slice(0, 15 - (currentAssets.headlines?.length || 0));
        for (const h of toAdd) {
          try {
            const assetRes = await mutateResource(accessToken, customerId, "assets", [{
              create: { textAsset: { text: cut(String(h).trim(), 30) } },
            }], managerCustomerId);
            const assetRN = assetRes.results?.[0]?.resourceName;
            if (assetRN) {
              await mutateResource(accessToken, customerId, "assetGroupAssets", [{
                create: { assetGroup: assetGroupResourceName, asset: assetRN, fieldType: "HEADLINE" },
              }], managerCustomerId);
              results.push({ action: "add_headline", success: true, details: cut(String(h), 30) });
            }
          } catch (e: any) {
            warnings.push(`Headline "${cut(String(h), 30)}": ${e.message?.slice(0, 100)}`);
          }
        }
      }

      // ── Add Descriptions ──
      if (generated.descriptions?.length > 0 && gaps.needDescriptions) {
        const toAdd = generated.descriptions.slice(0, 5 - (currentAssets.descriptions?.length || 0));
        for (const d of toAdd) {
          try {
            const assetRes = await mutateResource(accessToken, customerId, "assets", [{
              create: { textAsset: { text: cut(String(d).trim(), 90) } },
            }], managerCustomerId);
            const assetRN = assetRes.results?.[0]?.resourceName;
            if (assetRN) {
              await mutateResource(accessToken, customerId, "assetGroupAssets", [{
                create: { assetGroup: assetGroupResourceName, asset: assetRN, fieldType: "DESCRIPTION" },
              }], managerCustomerId);
              results.push({ action: "add_description", success: true, details: cut(String(d), 90) });
            }
          } catch (e: any) {
            warnings.push(`Description: ${e.message?.slice(0, 100)}`);
          }
        }
      }

      // ── Add Long Headlines ──
      if (generated.longHeadlines?.length > 0 && gaps.needLongHeadlines) {
        const toAdd = generated.longHeadlines.slice(0, 5 - (currentAssets.longHeadlines?.length || 0));
        for (const lh of toAdd) {
          try {
            const assetRes = await mutateResource(accessToken, customerId, "assets", [{
              create: { textAsset: { text: cut(String(lh).trim(), 90) } },
            }], managerCustomerId);
            const assetRN = assetRes.results?.[0]?.resourceName;
            if (assetRN) {
              await mutateResource(accessToken, customerId, "assetGroupAssets", [{
                create: { assetGroup: assetGroupResourceName, asset: assetRN, fieldType: "LONG_HEADLINE" },
              }], managerCustomerId);
              results.push({ action: "add_long_headline", success: true, details: cut(String(lh), 90) });
            }
          } catch (e: any) {
            warnings.push(`Long headline: ${e.message?.slice(0, 100)}`);
          }
        }
      }

      // ── Add Search Themes ──
      if (generated.searchThemes?.length > 0 && gaps.needSearchThemes) {
        const toAdd = generated.searchThemes.slice(0, 25 - (ag.searchThemes?.length || 0));
        for (const theme of toAdd) {
          try {
            await mutateResource(accessToken, customerId, "assetGroupSignals", [{
              create: {
                assetGroup: assetGroupResourceName,
                searchTheme: { text: cut(String(theme).trim(), 80) },
              },
            }], managerCustomerId);
            results.push({ action: "add_search_theme", success: true, details: String(theme) });
          } catch (e: any) {
            warnings.push(`Search theme "${theme}": ${e.message?.slice(0, 100)}`);
          }
        }
      }

      // ── Add Sitelinks ──
      if (generated.sitelinks?.length > 0 && gaps.needSitelinks) {
        const toAdd = generated.sitelinks.slice(0, 6 - state.campaignAssets.sitelinks.length);
        for (const sl of toAdd) {
          try {
            const payload: Record<string, unknown> = {
              finalUrls: [sl.finalUrl || websiteUrl],
              sitelinkAsset: {
                linkText: cut(String(sl.text || "").trim(), 25),
              },
            };
            if (sl.description1) (payload.sitelinkAsset as any).description1 = cut(String(sl.description1).trim(), 35);
            if (sl.description2) (payload.sitelinkAsset as any).description2 = cut(String(sl.description2).trim(), 35);

            const assetRes = await mutateResource(accessToken, customerId, "assets", [{
              create: payload,
            }], managerCustomerId);
            const assetRN = assetRes.results?.[0]?.resourceName;
            if (assetRN) {
              await mutateResource(accessToken, customerId, "campaignAssets", [{
                create: { campaign: campaignResourceName, asset: assetRN, fieldType: "SITELINK" },
              }], managerCustomerId);
              results.push({ action: "add_sitelink", success: true, details: sl.text });
            }
          } catch (e: any) {
            warnings.push(`Sitelink "${sl.text}": ${e.message?.slice(0, 100)}`);
          }
        }
      }

      // ── Add Callouts ──
      if (generated.callouts?.length > 0 && gaps.needCallouts) {
        const toAdd = generated.callouts.slice(0, 10 - state.campaignAssets.callouts.length);
        for (const callout of toAdd) {
          const calloutText = cut(String(callout).trim(), 25);
          if (!calloutText) continue;
          try {
            // Create the callout asset
            const assetRes = await mutateResource(accessToken, customerId, "assets", [{
              create: { calloutAsset: { calloutText } },
            }], managerCustomerId);
            const assetRN = assetRes.results?.[0]?.resourceName;
            if (!assetRN) {
              warnings.push(`Callout "${calloutText}": no resource name returned`);
              continue;
            }
            console.log(`[PMAX-OPT] Callout asset created: ${assetRN}, linking to campaign...`);
            // Link to campaign - use try/catch separately to handle duplicates
            try {
              await mutateResource(accessToken, customerId, "campaignAssets", [{
                create: { campaign: campaignResourceName, asset: assetRN, fieldType: "CALLOUT" },
              }], managerCustomerId);
              results.push({ action: "add_callout", success: true, details: calloutText });
            } catch (linkErr: any) {
              // If already linked or duplicate, treat as success
              if (linkErr.message?.includes("ALREADY_EXISTS") || linkErr.message?.includes("DUPLICATE")) {
                results.push({ action: "add_callout", success: true, details: `${calloutText} (already linked)` });
              } else {
                console.error(`[PMAX-OPT] Callout link error for "${calloutText}":`, linkErr.message?.slice(0, 300));
                warnings.push(`Callout "${calloutText}": ${linkErr.message?.slice(0, 150)}`);
              }
            }
          } catch (e: any) {
            console.error(`[PMAX-OPT] Callout create error for "${calloutText}":`, e.message?.slice(0, 300));
            warnings.push(`Callout "${calloutText}": ${e.message?.slice(0, 100)}`);
          }
        }
      }

      // ── Add Promotions ──
      if (generated.promotions?.length > 0 && gaps.needPromotions) {
        for (const promo of generated.promotions.slice(0, 6)) {
          try {
            const promoPayload: Record<string, unknown> = {
              promotionTarget: cut(String(promo.promotionTarget || "").trim(), 20),
              occasion: promo.occasion || "NONE",
            };
            if (promo.percentOff) promoPayload.percentOff = Number(promo.percentOff);
            if (promo.moneyAmountOff) promoPayload.moneyAmountOff = promo.moneyAmountOff;
            if (promo.discountModifier) promoPayload.discountModifier = promo.discountModifier;

            const assetPayload: Record<string, unknown> = { promotionAsset: promoPayload };
            if (promo.finalUrl) assetPayload.finalUrls = [promo.finalUrl];

            const assetRes = await mutateResource(accessToken, customerId, "assets", [{
              create: assetPayload,
            }], managerCustomerId);
            const assetRN = assetRes.results?.[0]?.resourceName;
            if (assetRN) {
              await mutateResource(accessToken, customerId, "campaignAssets", [{
                create: { campaign: campaignResourceName, asset: assetRN, fieldType: "PROMOTION" },
              }], managerCustomerId);
              results.push({ action: "add_promotion", success: true, details: promo.promotionTarget });
            }
          } catch (e: any) {
            warnings.push(`Promotion "${promo.promotionTarget}": ${e.message?.slice(0, 100)}`);
          }
        }
      }

      // ── Add Structured Snippets ──
      if (generated.structuredSnippets?.length > 0 && gaps.needSnippets) {
        for (const snippet of generated.structuredSnippets.slice(0, 4)) {
          try {
            const values = (snippet.values || []).map((v: string) => cut(String(v).trim(), 25)).filter(Boolean);
            if (!snippet.header || values.length < 3) { warnings.push(`Snippet "${snippet.header}": needs at least 3 values`); continue; }

            const assetRes = await mutateResource(accessToken, customerId, "assets", [{
              create: {
                structuredSnippetAsset: {
                  header: snippet.header,
                  values: values.slice(0, 10),
                },
              },
            }], managerCustomerId);
            const assetRN = assetRes.results?.[0]?.resourceName;
            if (assetRN) {
              await mutateResource(accessToken, customerId, "campaignAssets", [{
                create: { campaign: campaignResourceName, asset: assetRN, fieldType: "STRUCTURED_SNIPPET" },
              }], managerCustomerId);
              results.push({ action: "add_snippet", success: true, details: `${snippet.header}: ${values.join(", ")}` });
            }
          } catch (e: any) {
            warnings.push(`Snippet "${snippet.header}": ${e.message?.slice(0, 100)}`);
          }
        }
      }

      // ── Add Prices ──
      if (generated.prices?.length > 0 && gaps.needPrices) {
        for (const priceSet of generated.prices.slice(0, 2)) {
          try {
            const offerings = (priceSet.priceOfferings || []).slice(0, 8).map((o: any) => ({
              header: cut(String(o.header || "").trim(), 25),
              description: o.description ? cut(String(o.description).trim(), 25) : undefined,
              price: o.price || { currencyCode: "EUR", amountMicros: "0" },
              unit: o.unit || "PER_MONTH",
              finalUrl: o.finalUrl || websiteUrl,
            }));
            if (offerings.length < 3) { warnings.push(`Price set "${priceSet.type}": needs at least 3 offerings`); continue; }

            const assetRes = await mutateResource(accessToken, customerId, "assets", [{
              create: {
                priceAsset: {
                  type: priceSet.type || "SERVICES",
                  languageCode: "en",
                  priceOfferings: offerings,
                },
              },
            }], managerCustomerId);
            const assetRN = assetRes.results?.[0]?.resourceName;
            if (assetRN) {
              await mutateResource(accessToken, customerId, "campaignAssets", [{
                create: { campaign: campaignResourceName, asset: assetRN, fieldType: "PRICE" },
              }], managerCustomerId);
              results.push({ action: "add_price", success: true, details: `${priceSet.type}: ${offerings.length} offerings` });
            }
          } catch (e: any) {
            warnings.push(`Price "${priceSet.type}": ${e.message?.slice(0, 100)}`);
          }
        }
      }


      if (gaps.needPhone && (generated.phone?.number || body.phoneNumber)) {
        const phoneNumber = generated.phone?.number || body.phoneNumber;
        const countryCode = generated.phone?.country || body.phoneCountry || "FR";
        try {
          const assetRes = await mutateResource(accessToken, customerId, "assets", [{
            create: {
              callAsset: {
                phoneNumber: String(phoneNumber),
                countryCode: String(countryCode).toUpperCase(),
              },
            },
          }], managerCustomerId);
          const assetRN = assetRes.results?.[0]?.resourceName;
          if (assetRN) {
            await mutateResource(accessToken, customerId, "campaignAssets", [{
              create: { campaign: campaignResourceName, asset: assetRN, fieldType: "CALL" },
            }], managerCustomerId);
            results.push({ action: "add_phone", success: true, details: phoneNumber });
          }
        } catch (e: any) {
          warnings.push(`Phone: ${e.message?.slice(0, 100)}`);
        }
      }

      // ── Add Lead Form ──
      if (gaps.needLeadForm && generated.leadForm?.headline) {
        try {
          const leadFormPayload: Record<string, unknown> = {
            headline: cut(String(generated.leadForm.headline).trim(), 30),
            description: cut(String(generated.leadForm.description || "Fill out the form").trim(), 200),
            privacyPolicyUrl: body.privacyPolicyUrl || websiteUrl,
            businessName: brandName,
            callToActionType: "LEARN_MORE",
          };

          const fieldMap: Record<string, string> = {
            FULL_NAME: "FULL_NAME", EMAIL: "EMAIL", PHONE_NUMBER: "PHONE_NUMBER",
            COMPANY_NAME: "COMPANY_NAME", CITY: "CITY",
          };
          const fields = (generated.leadForm.fields || ["FULL_NAME", "EMAIL"])
            .map((f: string) => fieldMap[f.trim().toUpperCase()])
            .filter(Boolean)
            .map((inputType: string) => ({ inputType }));
          if (fields.length > 0) leadFormPayload.fields = fields;

          const assetRes = await mutateResource(accessToken, customerId, "assets", [{
            create: { leadFormAsset: leadFormPayload },
          }], managerCustomerId);
          const assetRN = assetRes.results?.[0]?.resourceName;
          if (assetRN) {
            await mutateResource(accessToken, customerId, "campaignAssets", [{
              create: { campaign: campaignResourceName, asset: assetRN, fieldType: "LEAD_FORM" },
            }], managerCustomerId);
            results.push({ action: "add_lead_form", success: true, details: generated.leadForm.headline });
          }
        } catch (e: any) {
          warnings.push(`Lead form: ${e.message?.slice(0, 100)}`);
        }
      }

      // ── Add Audience Signal (Real AssetGroupSignal with Audience) ──
      if (gaps.needAudienceSignal && generated.audienceSignal) {
        try {
          const sig = generated.audienceSignal;
          console.log("[PMAX-OPT] Creating audience signal:", JSON.stringify(sig));
          
          const audienceName = sig.name || `${brandName} - AI Audience ${Date.now()}`;
          const audienceDimensions: any[] = [];

          // Step 1: Create CustomAudience with keywords (search intent)
          let customAudienceResourceName: string | null = null;
          if (sig.customSegments?.length > 0) {
            try {
              const members = sig.customSegments.map((kw: string) => ({
                memberType: "KEYWORD",
                keyword: cut(String(kw).trim(), 80),
              }));
              
              const caRes = await mutateResource(accessToken, customerId, "customAudiences", [{
                create: {
                  name: `${audienceName} - Intent`,
                  type: "AUTO",
                  status: "ENABLED",
                  members,
                },
              }], managerCustomerId);
              
              customAudienceResourceName = caRes.results?.[0]?.resourceName;
              if (customAudienceResourceName) {
                console.log("[PMAX-OPT] CustomAudience created:", customAudienceResourceName);
                // Add custom audience segment to dimensions (audienceSegments is a message, not array)
                audienceDimensions.push({
                  audience_segments: {
                    segments: [{
                      custom_audience: { custom_audience: customAudienceResourceName },
                    }],
                  },
                });
                results.push({ action: "create_custom_audience", success: true, details: `${sig.customSegments.length} keywords` });
              }
            } catch (caErr: any) {
              console.warn("[PMAX-OPT] CustomAudience creation failed:", caErr.message?.slice(0, 300));
              warnings.push(`Custom audience: ${caErr.message?.slice(0, 150)}`);
            }
          }
          
          // Step 2: Add demographic dimensions (age and gender are separate dimensions)
          if (sig.demographics) {
            if (sig.demographics.ageRanges?.length > 0 && !sig.demographics.ageRanges.includes("all")) {
              const ageSegments = sig.demographics.ageRanges.map((ar: string) => {
                const ageMap: Record<string, [number, number]> = {
                  "18-24": [18, 24], "25-34": [25, 34],
                  "35-44": [35, 44], "45-54": [45, 54],
                  "55-64": [55, 64], "65+": [65, 0],
                };
                const range = ageMap[ar] || [18, 65];
                const seg: any = { minAge: range[0] };
                if (range[1] > 0) seg.maxAge = range[1];
                return seg;
              });
              audienceDimensions.push({ age: { age_ranges: ageSegments } });
            }
            if (sig.demographics.genders && !sig.demographics.genders.includes("all")) {
              audienceDimensions.push({
                gender: {
                  genders: sig.demographics.genders.map((g: string) => ({
                    type: g.toUpperCase(),
                  })),
                },
              });
            }
          }
          
          // Step 3: Create the Audience resource with all dimensions
          if (audienceDimensions.length > 0) {
            try {
              const audiencePayload: any = {
                name: audienceName,
                description: `AI-generated audience for ${brandName}`,
                dimensions: audienceDimensions,
              };
              // Scope to asset group for PMax
              audiencePayload.asset_group = assetGroupResourceName;
              
              const audRes = await mutateResource(accessToken, customerId, "audiences", [{
                create: audiencePayload,
              }], managerCustomerId);
              
              const audienceResourceName = audRes.results?.[0]?.resourceName;
              if (audienceResourceName) {
                console.log("[PMAX-OPT] Audience created:", audienceResourceName);
                
                // Step 4: Create AssetGroupSignal linking audience to asset group
                await mutateResource(accessToken, customerId, "assetGroupSignals", [{
                  create: {
                    asset_group: assetGroupResourceName,
                    audience: { audience: audienceResourceName },
                  },
                }], managerCustomerId);
                
                results.push({ action: "add_audience_signal", success: true, details: `Audience "${audienceName}" linked (${sig.customSegments?.length || 0} segments)` });
                console.log("[PMAX-OPT] AssetGroupSignal created successfully");
              }
            } catch (audErr: any) {
              console.error("[PMAX-OPT] Audience/Signal creation failed:", audErr.message?.slice(0, 500));
              warnings.push(`Audience signal: ${audErr.message?.slice(0, 200)}`);
              
              // Fallback: if Audience creation fails, try linking custom audience directly as signal
              if (customAudienceResourceName) {
                try {
                  // Create a simpler audience with just custom audience
                  const simpleAudPayload: any = {
                    name: `${audienceName} - Simple`,
                    description: `AI audience for ${brandName}`,
                    dimensions: [{
                      audience_segments: {
                        segments: [{
                          custom_audience: { custom_audience: customAudienceResourceName },
                        }],
                      },
                    }],
                  };
                  
                  const simpleRes = await mutateResource(accessToken, customerId, "audiences", [{
                    create: simpleAudPayload,
                  }], managerCustomerId);
                  
                  const simpleRN = simpleRes.results?.[0]?.resourceName;
                  if (simpleRN) {
                    await mutateResource(accessToken, customerId, "assetGroupSignals", [{
                      create: {
                        asset_group: assetGroupResourceName,
                        audience: { audience: simpleRN },
                      },
                    }], managerCustomerId);
                    results.push({ action: "add_audience_signal", success: true, details: `Fallback audience linked` });
                  }
                } catch (fbErr: any) {
                  warnings.push(`Fallback audience: ${fbErr.message?.slice(0, 150)}`);
                }
              }
            }
          } else {
            // No dimensions built - just add search themes as minimal signal
            if (sig.customSegments?.length > 0) {
              for (const theme of sig.customSegments.slice(0, 5)) {
                try {
                  await mutateResource(accessToken, customerId, "assetGroupSignals", [{
                    create: {
                      asset_group: assetGroupResourceName,
                      searchTheme: { text: cut(String(theme).trim(), 80) },
                    },
                  }], managerCustomerId);
                  results.push({ action: "add_audience_theme", success: true, details: theme });
                } catch (e: any) {
                  if (!e.message?.includes("ALREADY_EXISTS")) {
                    warnings.push(`Audience theme "${theme}": ${e.message?.slice(0, 100)}`);
                  }
                }
              }
            }
            results.push({ action: "add_audience_signal", success: true, details: `Added ${sig.customSegments?.length || 0} search themes as signals` });
          }
        } catch (e: any) {
          console.error("[PMAX-OPT] Audience signal error:", e.message?.slice(0, 300));
          warnings.push(`Audience signal: ${e.message?.slice(0, 150)}`);
        }
      }

      // ── Add Images (using provided URLs) ──
      if (gaps.needImages && body.imageUrls?.length > 0) {
        const maxToAdd = 20 - (currentAssets.images?.length || 0);
        for (const imgUrl of (body.imageUrls as string[]).slice(0, maxToAdd)) {
          try {
            const b64 = await downloadImageAsBase64(imgUrl.trim());
            if (!b64) { warnings.push(`Image download failed: ${imgUrl}`); continue; }

            const assetRes = await mutateResource(accessToken, customerId, "assets", [{
              create: {
                imageAsset: { data: b64 },
                name: `PMax Opt Image ${Date.now()}`,
              },
            }], managerCustomerId);
            const assetRN = assetRes.results?.[0]?.resourceName;
            if (assetRN) {
              await mutateResource(accessToken, customerId, "assetGroupAssets", [{
                create: { assetGroup: assetGroupResourceName, asset: assetRN, fieldType: "MARKETING_IMAGE" },
              }], managerCustomerId);
              results.push({ action: "add_image", success: true, details: imgUrl.slice(0, 50) });
            }
          } catch (e: any) {
            warnings.push(`Image: ${e.message?.slice(0, 100)}`);
          }
        }
      }

      // Log action
      await supabase.from("ads_actions").insert({
        user_id: user.id,
        action_type: "optimize_pmax",
        target_name: campaignSync.name,
        target_id: campaignId,
        description: `Optimized: ${results.filter(r => r.success).length} assets added, ${warnings.length} warnings`,
        status: "executed",
        result: JSON.stringify({ results, warnings, generated: { imageSearchQueries: generated.imageSearchQueries } }),
      });

      return new Response(JSON.stringify({
        success: true,
        applied: results.filter(r => r.success).length,
        results,
        warnings,
        imageSearchQueries: generated.imageSearchQueries || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}. Use: analyze, optimize`);

  } catch (error: unknown) {
    console.error("[PMAX-OPT] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: message === "Unauthorized" || message === "Google Ads not connected" ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
