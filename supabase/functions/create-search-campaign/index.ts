import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v22";

// ─── Helpers ─────────────────────────────────────────────

const cut = (s: string, n: number): string => s.length > n ? s.slice(0, n) : s;
const uniq = <T>(arr: T[]) => Array.from(new Set(arr));
const compact = <T>(arr: (T | null | undefined | false)[]) => arr.filter(Boolean) as T[];

type MatchType = "EXACT" | "PHRASE" | "BROAD";

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
  accessToken: string,
  customerId: string,
  resource: string,
  operations: unknown[],
  managerCustomerId?: string
): Promise<{ results?: { resourceName?: string }[] }> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "",
    "Content-Type": "application/json",
  };
  if (managerCustomerId && managerCustomerId !== customerId) {
    headers["login-customer-id"] = managerCustomerId;
  }

  const response = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/${resource}:mutate`,
    { method: "POST", headers, body: JSON.stringify({ operations }) }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`mutate ${resource} failed: ${errorText}`);
  }
  return await response.json();
}

async function atomicMutate(
  accessToken: string,
  customerId: string,
  mutateOperations: unknown[],
  managerCustomerId?: string
): Promise<{ mutateOperationResponses?: unknown[] }> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "",
    "Content-Type": "application/json",
  };
  if (managerCustomerId && managerCustomerId !== customerId) {
    headers["login-customer-id"] = managerCustomerId;
  }

  const response = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:mutate`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        mutateOperations,
        partialFailure: false,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Atomic mutate failed: ${errorText}`);
  }
  return await response.json();
}

// ─── Geo & Language maps ─────────────────────────────────

const GEO_MAP: Record<string, string> = {
  FR: "2250", BE: "2056", CH: "2756", DE: "2276", ES: "2724",
  IT: "2380", NL: "2528", US: "2840", GB: "2826", CA: "2124",
  PT: "2620", AT: "2040", LU: "2442", MA: "2504", TN: "2788",
};

const LANG_MAP: Record<string, string> = {
  fr: "1002", en: "1000", de: "1001", es: "1003",
  it: "1004", nl: "1010", pt: "1014",
};

// ─── Keyword Expansion (Rules-based) ─────────────────────

function expandKeywordsFromSeeds(
  seeds: string[],
  opts: { maxTotal: number; maxBroad: number }
): { text: string; matchType: MatchType }[] {
  const cleaned = uniq(seeds.map(s => s.trim()).filter(Boolean));

  const variants: string[] = [];
  for (const s of cleaned) {
    variants.push(s);
    variants.push(`${s} pas cher`);
    variants.push(`${s} design`);
    variants.push(`acheter ${s}`);
    variants.push(`${s} moderne`);
    variants.push(`${s} livraison rapide`);
    variants.push(`meilleur ${s}`);
    variants.push(`${s} en ligne`);
    variants.push(`${s} prix`);
    variants.push(`${s} promo`);
  }

  const dedup = uniq(variants.map(v => v.replace(/\s+/g, " ").trim()))
    .filter(v => v.length >= 2 && v.length <= 80);

  const exact = dedup.slice(0, Math.min(dedup.length, Math.floor(opts.maxTotal * 0.25)))
    .map(text => ({ text, matchType: "EXACT" as const }));

  const phrase = dedup.slice(exact.length, Math.min(dedup.length, Math.floor(opts.maxTotal * 0.8)))
    .map(text => ({ text, matchType: "PHRASE" as const }));

  const broad = dedup.slice(exact.length + phrase.length, exact.length + phrase.length + opts.maxBroad)
    .map(text => ({ text, matchType: "BROAD" as const }));

  const merged = [...exact, ...phrase, ...broad].slice(0, opts.maxTotal);
  return merged.length ? merged : cleaned.slice(0, 5).map(text => ({ text, matchType: "PHRASE" }));
}

// ─── Default RSA Generator ──────────────────────────────

function buildDefaultRSA(adGroupName: string) {
  const base = adGroupName.trim() || "Offres";
  const headlines = uniq(compact([
    `${cut(base, 22)} en promo`,
    `Livraison rapide`,
    `Prix direct`,
    `Qualité garantie`,
    `Nouveautés ${cut(base, 18)}`,
    `Meilleur rapport qualité`,
    `Service client réactif`,
    `Commande en ligne facile`,
    `Stocks limités`,
    `Offre spéciale ${cut(base, 14)}`,
  ])).slice(0, 15);

  const descriptions = uniq(compact([
    `Découvrez nos ${cut(base.toLowerCase(), 30)} : prix justes, qualité au top, livraison rapide.`,
    `Commandez en ligne. Paiement sécurisé. Retours simples.`,
    `Offres limitées — profitez des promotions du moment.`,
    `Assistance rapide et suivi de commande personnalisé.`,
  ])).map(d => cut(d, 90)).slice(0, 4);

  while (headlines.length < 3) headlines.push(`Découvrez ${cut(base, 20)}`);
  while (descriptions.length < 2) descriptions.push(`Trouvez ${cut(base.toLowerCase(), 30)} au meilleur prix.`);

  return { headlines, descriptions };
}

// ─── Interfaces ──────────────────────────────────────────

interface AgencyProAdGroup {
  name: string;
  finalUrl: string;
  cpcBidMicros?: number;
  path1?: string;
  path2?: string;
  // Provide either seedKeywords OR keywords
  seedKeywords?: string[];
  keywords?: { text: string; matchType: MatchType }[];
  // RSA (auto-generated if missing)
  headlines?: string[];
  descriptions?: string[];
}

interface SearchSitelink {
  linkText: string;
  finalUrls: string[];
  description1?: string;
  description2?: string;
}

interface AgencyProParams {
  name: string;
  dailyBudget: number;
  locations?: string[];
  language?: string;
  brandName?: string;
  biddingStrategy: "manual_cpc" | "maximize_clicks" | "maximize_conversions" | "target_cpa";
  targetCpaMicros?: number;
  adGroups: AgencyProAdGroup[];
  sitelinks?: SearchSitelink[];
  callouts?: string[];
  negativeKeywords?: { text: string; matchType?: "PHRASE" | "EXACT" }[];
  maxKeywordsPerAdGroup?: number;
  maxBroadKeywordsPerAdGroup?: number;
}

// ─── Main ────────────────────────────────────────────────

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

    // Google Ads connection
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
      await supabase.from("user_connections").update({
        access_token: newToken,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      }).eq("id", connection.id);
    }

    const customerId = (connection.account_id as string).replace(/-/g, "");
    const metadata = connection.metadata as Record<string, unknown> || {};
    const managerCustomerId = (metadata.manager_customer_id as string || "").replace(/-/g, "") || undefined;

    // Parse params
    const params: AgencyProParams = await req.json();
    const warnings: string[] = [];
    const maxKw = params.maxKeywordsPerAdGroup ?? 30;
    const maxBroad = params.maxBroadKeywordsPerAdGroup ?? 10;

    // Validate
    if (!params.name) throw new Error("Campaign name is required");
    if (!params.adGroups?.length) throw new Error("At least one ad group is required");

    console.log(`[SEARCH-CAMPAIGN-PRO] Creating "${params.name}" with ${params.adGroups.length} ad groups for user ${user.id}`);

    // ─────────────────────────────────────────────
    // 1) Budget (non-atomic, needed as dependency)
    // ─────────────────────────────────────────────
    const budgetAmountMicros = Math.round(params.dailyBudget * 1_000_000);

    const budgetRes = await mutateResource(accessToken, customerId, "campaignBudgets", [{
      create: {
        name: `${params.name} - Budget`,
        amountMicros: String(budgetAmountMicros),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      },
    }], managerCustomerId);

    const budgetResourceName = budgetRes.results?.[0]?.resourceName;
    if (!budgetResourceName) throw new Error("Failed to create budget");
    console.log("[SEARCH-CAMPAIGN-PRO] Budget created:", budgetResourceName);

    // ─────────────────────────────────────────────
    // 2) Build atomic operations
    // ─────────────────────────────────────────────
    let tempId = -1;
    const nextId = () => tempId--;
    const ops: unknown[] = [];

    const campaignTempId = nextId();

    const campaignPayload: Record<string, unknown> = {
      resourceName: `customers/${customerId}/campaigns/${campaignTempId}`,
      name: params.name,
      status: "PAUSED",
      advertisingChannelType: "SEARCH",
      campaignBudget: budgetResourceName,
    };

    switch (params.biddingStrategy) {
      case "manual_cpc":
        campaignPayload.manualCpc = {};
        break;
      case "maximize_clicks":
        campaignPayload.maximizeClicks = {};
        break;
      case "maximize_conversions":
        campaignPayload.maximizeConversions = {};
        break;
      case "target_cpa":
        campaignPayload.maximizeConversions = {
          targetCpaMicros: String(params.targetCpaMicros || 0),
        };
        break;
    }

    ops.push({ campaignOperation: { create: campaignPayload } });

    // ─────────────────────────────────────────────
    // 3) Extensions: Sitelinks
    // ─────────────────────────────────────────────
    if (params.sitelinks?.length) {
      for (const sl of params.sitelinks) {
        const slTempId = nextId();
        ops.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${slTempId}`,
              name: cut(sl.linkText, 25),
              sitelinkAsset: {
                linkText: cut(sl.linkText, 25),
                ...(sl.description1 ? { description1: cut(sl.description1, 35) } : {}),
                ...(sl.description2 ? { description2: cut(sl.description2, 35) } : {}),
              },
              finalUrls: sl.finalUrls,
            },
          },
        });
        ops.push({
          campaignAssetOperation: {
            create: {
              campaign: `customers/${customerId}/campaigns/${campaignTempId}`,
              asset: `customers/${customerId}/assets/${slTempId}`,
              fieldType: "SITELINK",
            },
          },
        });
      }
    }

    // ─────────────────────────────────────────────
    // 4) Extensions: Callouts
    // ─────────────────────────────────────────────
    if (params.callouts?.length) {
      for (const co of params.callouts) {
        const text = cut(co.trim(), 25);
        if (!text) continue;
        const coTempId = nextId();
        ops.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${coTempId}`,
              name: text,
              calloutAsset: { calloutText: text },
            },
          },
        });
        ops.push({
          campaignAssetOperation: {
            create: {
              campaign: `customers/${customerId}/campaigns/${campaignTempId}`,
              asset: `customers/${customerId}/assets/${coTempId}`,
              fieldType: "CALLOUT",
            },
          },
        });
      }
    }

    // ─────────────────────────────────────────────
    // 5) Ad Groups + Keywords (seed expansion) + RSA (auto-generated)
    // ─────────────────────────────────────────────
    let totalKeywords = 0;

    for (const ag of params.adGroups) {
      const agTempId = nextId();

      ops.push({
        adGroupOperation: {
          create: {
            resourceName: `customers/${customerId}/adGroups/${agTempId}`,
            name: cut(ag.name, 128),
            campaign: `customers/${customerId}/campaigns/${campaignTempId}`,
            status: "ENABLED",
            type: "SEARCH_STANDARD",
            ...(ag.cpcBidMicros ? { cpcBidMicros: String(ag.cpcBidMicros) } : {}),
          },
        },
      });

      // Keywords: prefer provided; else expand from seeds
      let kws: { text: string; matchType: MatchType }[] = ag.keywords?.length
        ? ag.keywords
        : expandKeywordsFromSeeds(ag.seedKeywords || [ag.name], { maxTotal: maxKw, maxBroad });

      // Sanitize
      kws = kws
        .map(k => ({ ...k, text: k.text.trim().replace(/\s+/g, " ") }))
        .filter(k => k.text.length >= 2 && k.text.length <= 80)
        .slice(0, maxKw);

      totalKeywords += kws.length;

      for (const kw of kws) {
        const kwTempId = nextId();
        ops.push({
          adGroupCriterionOperation: {
            create: {
              resourceName: `customers/${customerId}/adGroupCriteria/${kwTempId}`,
              adGroup: `customers/${customerId}/adGroups/${agTempId}`,
              status: "ENABLED",
              keyword: { text: kw.text, matchType: kw.matchType },
            },
          },
        });
      }

      // RSA: use provided or auto-generate defaults
      const rsa = (() => {
        const base = buildDefaultRSA(ag.name);
        const headlines = uniq(
          (ag.headlines?.length ? ag.headlines : base.headlines)
            .map(h => cut(h.trim(), 30))
            .filter(Boolean)
        ).slice(0, 15);
        const descriptions = uniq(
          (ag.descriptions?.length ? ag.descriptions : base.descriptions)
            .map(d => cut(d.trim(), 90))
            .filter(Boolean)
        ).slice(0, 4);
        while (headlines.length < 3) headlines.push(`Découvrez ${cut(ag.name, 20)}`);
        while (descriptions.length < 2) descriptions.push(`Trouvez ${cut(ag.name.toLowerCase(), 30)} au meilleur prix.`);
        return { headlines, descriptions };
      })();

      ops.push({
        adGroupAdOperation: {
          create: {
            adGroup: `customers/${customerId}/adGroups/${agTempId}`,
            status: "PAUSED",
            ad: {
              finalUrls: [ag.finalUrl],
              responsiveSearchAd: {
                headlines: rsa.headlines.map(text => ({ text })),
                descriptions: rsa.descriptions.map(text => ({ text })),
                ...(ag.path1 ? { path1: cut(ag.path1, 15) } : {}),
                ...(ag.path2 ? { path2: cut(ag.path2, 15) } : {}),
              },
            },
          },
        },
      });
    }

    console.log(`[SEARCH-CAMPAIGN-PRO] Sending ${ops.length} atomic operations (${totalKeywords} keywords)...`);

    // ─────────────────────────────────────────────
    // 6) Atomic mutate
    // ─────────────────────────────────────────────
    const atomicRes = await atomicMutate(accessToken, customerId, ops, managerCustomerId);

    const mutateResults = (atomicRes.mutateOperationResponses || []) as Record<string, unknown>[];
    const campaignResult = mutateResults.find((r) => (r as Record<string, unknown>).campaignResult) as Record<string, unknown> | undefined;
    const campaignResourceName = (campaignResult?.campaignResult as Record<string, unknown>)?.resourceName as string | undefined;

    if (!campaignResourceName) throw new Error("Failed to create Search campaign");

    const campaignId = campaignResourceName.split("/").pop();
    console.log("[SEARCH-CAMPAIGN-PRO] Campaign created:", campaignResourceName);

    // ─────────────────────────────────────────────
    // 7) Location targeting (post-atomic)
    // ─────────────────────────────────────────────
    if (params.locations?.length) {
      const locationOps = params.locations
        .map(loc => GEO_MAP[loc.toUpperCase()])
        .filter(Boolean)
        .map(geoId => ({
          create: {
            campaign: campaignResourceName,
            location: { geoTargetConstant: `geoTargetConstants/${geoId}` },
          },
        }));

      if (locationOps.length) {
        try {
          await mutateResource(accessToken, customerId, "campaignCriteria", locationOps, managerCustomerId);
          console.log("[SEARCH-CAMPAIGN-PRO] Location targeting set:", params.locations);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push(`Location targeting skipped: ${msg}`);
        }
      }
    }

    // ─────────────────────────────────────────────
    // 8) Language targeting (post-atomic)
    // ─────────────────────────────────────────────
    if (params.language) {
      const langId = LANG_MAP[params.language.toLowerCase()];
      if (langId) {
        try {
          await mutateResource(accessToken, customerId, "campaignCriteria", [{
            create: {
              campaign: campaignResourceName,
              language: { languageConstant: `languageConstants/${langId}` },
            },
          }], managerCustomerId);
          console.log("[SEARCH-CAMPAIGN-PRO] Language targeting set:", params.language);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push(`Language targeting skipped: ${msg}`);
        }
      }
    }

    // ─────────────────────────────────────────────
    // 9) Campaign-level Negative Keywords (post-atomic)
    // ─────────────────────────────────────────────
    if (params.negativeKeywords?.length) {
      const negOps = params.negativeKeywords
        .map(nk => nk.text.trim())
        .filter(Boolean)
        .slice(0, 200)
        .map(text => ({
          create: {
            campaign: campaignResourceName,
            negative: true,
            keyword: {
              text: cut(text, 80),
              matchType: params.negativeKeywords?.find(x => x.text.trim() === text)?.matchType || "PHRASE",
            },
          },
        }));

      if (negOps.length) {
        try {
          await mutateResource(accessToken, customerId, "campaignCriteria", negOps, managerCustomerId);
          console.log("[SEARCH-CAMPAIGN-PRO] Negative keywords set:", negOps.length);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push(`Negative keywords skipped: ${msg}`);
        }
      }
    }

    // ─────────────────────────────────────────────
    // 10) Sync to local DB
    // ─────────────────────────────────────────────
    try {
      await supabase.from("campaigns_sync").upsert({
        user_id: user.id,
        google_campaign_id: campaignId,
        google_customer_id: customerId,
        name: params.name,
        status: "PAUSED",
        advertising_channel_type: "SEARCH",
        bidding_strategy_type: params.biddingStrategy.toUpperCase(),
        budget_amount_micros: budgetAmountMicros,
        budget_resource_name: budgetResourceName,
        last_synced_at: new Date().toISOString(),
        sync_status: "synced",
      }, { onConflict: "user_id,google_campaign_id" });
    } catch (dbErr) {
      console.warn("[SEARCH-CAMPAIGN-PRO] DB sync warning:", dbErr);
    }

    // Log action
    await supabase.from("ads_actions").insert({
      user_id: user.id,
      action_type: "create_search_campaign_pro",
      target_name: params.name,
      target_id: campaignId,
      description: `Agency Pro Search campaign "${params.name}" created: ${params.adGroups.length} ad group(s), ${totalKeywords} keywords (expanded), ${params.sitelinks?.length || 0} sitelinks, ${params.callouts?.length || 0} callouts, ${params.negativeKeywords?.length || 0} negatives, budget €${params.dailyBudget}/day`,
      status: "executed",
    });

    return new Response(JSON.stringify({
      success: true,
      campaignResourceName,
      campaignId,
      totalOperations: ops.length,
      adGroups: params.adGroups.length,
      totalKeywords,
      sitelinks: params.sitelinks?.length || 0,
      callouts: params.callouts?.length || 0,
      negativeKeywords: params.negativeKeywords?.length || 0,
      warnings,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[SEARCH-CAMPAIGN-PRO] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
