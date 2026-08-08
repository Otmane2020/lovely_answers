import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v19";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Auth
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

    // Parse request body for explicit business context
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }

    // Use explicit context if provided, otherwise fall back to active project
    let websiteUrl = (body.websiteUrl as string) || "";
    let brandName = (body.brandName as string) || "";
    let businessDesc = (body.businessDescription as string) || "";
    let language = (body.language as string) || "fr";
    let existingCompetitors: string[] = (body.competitors as string[]) || [];

    // Only fetch from project if no explicit context was provided
    if (!websiteUrl && !brandName) {
      const { data: project } = await supabase
        .from("projects")
        .select("website_url, business_description, brand_name, competitors, language")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      websiteUrl = project?.website_url || "";
      brandName = project?.brand_name || "";
      businessDesc = project?.business_description || "";
      language = project?.language || "fr";
      existingCompetitors = project?.competitors || [];
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

    // Step 1: Use AI to identify competitors and generate ad group structure
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const competitorContext = existingCompetitors.length > 0 
      ? `Known competitors: ${existingCompetitors.join(", ")}` 
      : "";

    const aiPrompt = `You are a Google Ads competitor analysis expert.

Business: "${brandName}" - ${businessDesc}
Website: ${websiteUrl}
${competitorContext}

Task: Based STRICTLY on the business description and website above, identify 2-3 direct competitors in the SAME industry/niche. Do NOT default to AI SEO tools unless the business is actually an AI SEO tool. Analyze the business type carefully and find real competitors.

Return ONLY valid JSON:
{
  "competitors": [
    { "name": "CompetitorBrand", "domain": "competitor.com", "weakness": "Short weakness to exploit" }
  ],
  "ad_group": {
    "name": "Competitor - [main theme]",
    "keywords": [
      { "keyword": "competitor brand name", "match_type": "EXACT" },
      { "keyword": "competitor brand alternative", "match_type": "PHRASE" },
      { "keyword": "competitor brand vs", "match_type": "BROAD" }
    ],
    "negative_keywords": ["free", "crack", "download"],
    "ads": [
      {
        "headlines": ["Better Than [Competitor]", "${brandName} vs [Competitor]", "Switch from [Competitor]", "Try ${brandName} Instead", "#1 [Competitor] Alternative", "Save vs [Competitor]", "Why ${brandName} Wins", "Best in Category", "Start Free Today"],
        "descriptions": [
          "Looking for a [Competitor] alternative? ${brandName} offers better results. Try free!",
          "Switch from [Competitor] to ${brandName}. More features, better service, transparent pricing."
        ],
        "final_urls": ["${websiteUrl}"],
        "path1": "alternative",
        "path2": ""
      }
    ]
  }
}

Rules:
- Headlines max 30 characters each, provide 9-15
- Descriptions max 90 characters each, provide 2-4
- Include each competitor's brand name as EXACT match keyword
- Include "[brand] alternative" and "[brand] vs" variations
- Ad copy must highlight ${brandName}'s advantages over each competitor
- Use ${language} for ad copy
- CRITICAL: Find competitors that match the ACTUAL business described above (${businessDesc}), NOT generic AI/SEO tools
- If competitors are already provided (${existingCompetitors.join(", ") || "none"}), prioritize those`;

    console.log("[COMPETITOR] Generating competitor ad group via AI...");
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [{ role: "user", content: aiPrompt }],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[COMPETITOR] AI error:", errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[COMPETITOR] Parse error:", content);
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: content }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { competitors, ad_group } = parsed;
    console.log("[COMPETITOR] Found competitors:", competitors?.map((c: any) => c.name));

    // Step 2: Find an existing campaign to attach the ad group to
    const searchQuery = `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status = 'ENABLED' ORDER BY campaign.id DESC LIMIT 1`;
    const searchRes = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      { method: "POST", headers: apiHeaders, body: JSON.stringify({ query: searchQuery }) }
    );

    let campaignResourceName: string | null = null;
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const campaign = searchData.results?.[0]?.campaign;
      if (campaign) {
        campaignResourceName = campaign.resourceName || `customers/${customerId}/campaigns/${campaign.id}`;
        console.log("[COMPETITOR] Using campaign:", campaign.name);
      }
    } else {
      await searchRes.text(); // consume body
    }

    if (!campaignResourceName) {
      return new Response(JSON.stringify({ 
        error: "No active campaign found. Create a campaign first.",
        competitors 
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Create the ad group in Google Ads
    const adGroupName = ad_group?.name || `Competitor - ${competitors?.map((c: any) => c.name).join(" / ")}`;
    
    const createAdGroupBody = {
      operations: [{
        create: {
          name: adGroupName,
          campaign: campaignResourceName,
          status: "ENABLED",
          type: "SEARCH_STANDARD",
          cpcBidMicros: "1500000", // 1.50€
        },
      }],
    };

    console.log("[COMPETITOR] Creating ad group:", adGroupName);
    const agRes = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/adGroups:mutate`,
      { method: "POST", headers: apiHeaders, body: JSON.stringify(createAdGroupBody) }
    );

    if (!agRes.ok) {
      const errText = await agRes.text();
      console.error("[COMPETITOR] Ad group creation failed:", errText);
      return new Response(JSON.stringify({ error: "Failed to create ad group: " + errText, competitors }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agData = await agRes.json();
    const adGroupResourceName = agData.results?.[0]?.resourceName;
    console.log("[COMPETITOR] Ad group created:", adGroupResourceName);

    // Step 4: Add competitor keywords
    const keywordOps = (ad_group?.keywords || []).map((kw: any) => ({
      create: {
        adGroup: adGroupResourceName,
        status: "ENABLED",
        keyword: {
          text: kw.keyword,
          matchType: kw.match_type || "EXACT",
        },
      },
    }));

    // Add negative keywords
    const negativeKwOps = (ad_group?.negative_keywords || []).map((kw: string) => ({
      create: {
        adGroup: adGroupResourceName,
        status: "ENABLED",
        keyword: {
          text: kw,
          matchType: "EXACT",
        },
        negative: true,
      },
    }));

    if (keywordOps.length > 0) {
      const kwRes = await fetch(
        `${GOOGLE_ADS_API_BASE}/customers/${customerId}/adGroupCriteria:mutate`,
        { method: "POST", headers: apiHeaders, body: JSON.stringify({ operations: [...keywordOps, ...negativeKwOps] }) }
      );
      if (!kwRes.ok) {
        const errText = await kwRes.text();
        console.error("[COMPETITOR] Keywords creation warning:", errText);
      } else {
        const kwData = await kwRes.json();
        console.log("[COMPETITOR] Keywords created:", kwData.results?.length);
      }
    }

    // Step 5: Create responsive search ad
    const adData = ad_group?.ads?.[0];
    if (adData) {
      const headlines = (adData.headlines || []).slice(0, 15).map((h: string, i: number) => ({
        text: h.substring(0, 30),
        pinnedField: i === 0 ? "HEADLINE_1" : undefined,
      })).filter((h: any) => h.text.length > 0);

      const descriptions = (adData.descriptions || []).slice(0, 4).map((d: string) => ({
        text: d.substring(0, 90),
      })).filter((d: any) => d.text.length > 0);

      const adBody = {
        operations: [{
          create: {
            adGroup: adGroupResourceName,
            status: "ENABLED",
            ad: {
              responsiveSearchAd: {
                headlines,
                descriptions,
              },
              finalUrls: adData.final_urls || [websiteUrl],
              path1: adData.path1 || "alternative",
              path2: adData.path2 || "ai-seo",
            },
          },
        }],
      };

      const adRes = await fetch(
        `${GOOGLE_ADS_API_BASE}/customers/${customerId}/adGroupAds:mutate`,
        { method: "POST", headers: apiHeaders, body: JSON.stringify(adBody) }
      );
      if (!adRes.ok) {
        const errText = await adRes.text();
        console.error("[COMPETITOR] Ad creation warning:", errText);
      } else {
        console.log("[COMPETITOR] Ad created successfully");
      }
    }

    // Step 6: Sync back to local DB
    await supabase.from("ads_sync").insert(
      (ad_group?.keywords || []).slice(0, 5).map((kw: any) => ({
        user_id: user.id,
        google_ad_id: `competitor_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        ad_group_name: adGroupName,
        google_ad_group_id: adGroupResourceName?.split("/").pop() || null,
        status: "ENABLED",
        headlines: adData?.headlines || [],
        descriptions: adData?.descriptions || [],
        clicks: 0,
        impressions: 0,
        cost_micros: 0,
        conversions: 0,
      }))
    );

    return new Response(JSON.stringify({ 
      success: true,
      competitors,
      adGroupName,
      adGroupResource: adGroupResourceName,
      keywordsCount: keywordOps.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[COMPETITOR] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
