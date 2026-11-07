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

const CONVERSIONS_TO_CREATE = [
  {
    name: "Sign Up",
    category: "SIGNUP",
    type: "WEBPAGE",
    countingType: "ONE_PER_CLICK",
    defaultValue: 5.0,
    currencyCode: "USD",
    tag: "sign_up",
  },
  {
    name: "Onboarding Complete",
    category: "SUBMIT_LEAD_FORM",
    type: "WEBPAGE",
    countingType: "ONE_PER_CLICK",
    defaultValue: 10.0,
    currencyCode: "USD",
    tag: "onboarding_complete",
  },
  {
    name: "Begin Checkout",
    category: "BEGIN_CHECKOUT",
    type: "WEBPAGE",
    countingType: "ONE_PER_CLICK",
    defaultValue: 29.0,
    currencyCode: "USD",
    tag: "begin_checkout",
  },
  {
    name: "Purchase",
    category: "PURCHASE",
    type: "WEBPAGE",
    countingType: "ONE_PER_CLICK",
    defaultValue: 49.0,
    currencyCode: "USD",
    tag: "purchase",
  },
  {
    name: "Pricing Page View",
    category: "PAGE_VIEW",
    type: "WEBPAGE",
    countingType: "ONE_PER_CLICK",
    defaultValue: 1.0,
    currencyCode: "USD",
    tag: "pricing_view",
  },
];

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
    const userId = user.id;

    // Get Google Ads connection
    const { data: connection } = await supabase
      .from("user_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("connection_type", "google_ads")
      .eq("status", "connected")
      .maybeSingle();

    if (!connection?.access_token || !connection.account_id) {
      return new Response(JSON.stringify({ error: "Google Ads not connected or no account selected" }), {
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

    // List ALL existing conversion actions (including default ones) with their category
    const listQuery = `SELECT conversion_action.name, conversion_action.id, conversion_action.resource_name, conversion_action.category, conversion_action.status, conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.status != 'REMOVED'`;
    const listResponse = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      { method: "POST", headers: apiHeaders, body: JSON.stringify({ query: listQuery }) }
    );

    if (!listResponse.ok) {
      const errText = await listResponse.text();
      console.error("[CONV] Failed to list existing conversions:", errText);
      return new Response(JSON.stringify({ error: "Failed to list conversions: " + errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const listData = await listResponse.json();
    const existingByCategory: Record<string, { name: string; id: string; resourceName: string; tagSnippets?: unknown[] }> = {};
    const existingByName: Record<string, { name: string; id: string; resourceName: string; tagSnippets?: unknown[] }> = {};
    
    for (const row of (listData.results || [])) {
      const ca = row.conversionAction;
      if (ca) {
        const entry = { 
          name: ca.name, 
          id: ca.id, 
          resourceName: ca.resourceName,
          tagSnippets: ca.tagSnippets 
        };
        if (ca.category) existingByCategory[ca.category] = entry;
        if (ca.name) existingByName[ca.name] = entry;
      }
    }

    console.log("[CONV] Existing conversions by category:", Object.keys(existingByCategory));
    console.log("[CONV] Existing conversions by name:", Object.keys(existingByName));

    const extractLabel = (tagSnippets: unknown[]): string => {
      for (const snippet of tagSnippets) {
        const s = snippet as Record<string, unknown>;
        if (s.type === "EVENT_SNIPPET" && s.eventSnippet) {
          const match = (s.eventSnippet as string).match(/send_to['":\s]+['"]?(AW-[^'"}\s,]+)/);
          if (match) return match[1];
        }
      }
      return "";
    };

    const results: { name: string; tag: string; status: string; conversionLabel?: string; error?: string }[] = [];

    for (const conv of CONVERSIONS_TO_CREATE) {
      // Only check by exact name — category matching causes false positives with auto-created conversions
      const existing = existingByName[conv.name];

      if (existing) {
        console.log(`[CONV] "${conv.name}" already exists (found as "${existing.name}", category: ${conv.category}), skipping creation`);
        
        let label = "";
        if (existing.tagSnippets && Array.isArray(existing.tagSnippets)) {
          label = extractLabel(existing.tagSnippets);
        }
        
        // If no label from initial query, fetch tag snippets specifically
        if (!label) {
          const snippetQuery = `SELECT conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.resource_name = '${existing.resourceName}'`;
          const snippetRes = await fetch(
            `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
            { method: "POST", headers: apiHeaders, body: JSON.stringify({ query: snippetQuery }) }
          );
          if (snippetRes.ok) {
            const snippetData = await snippetRes.json();
            const snippets = snippetData.results?.[0]?.conversionAction?.tagSnippets;
            if (snippets && Array.isArray(snippets)) {
              label = extractLabel(snippets);
            }
          }
        }

        results.push({
          name: conv.name,
          tag: conv.tag,
          status: "already_exists",
          conversionLabel: label || `AW-${customerId}/${existing.id}`,
        });
        continue;
      }

      // Create the conversion action
      const createBody = {
        operations: [{
          create: {
            name: conv.name,
            category: conv.category,
            type: conv.type,
            countingType: conv.countingType,
            status: "ENABLED",
            primaryForGoal: true,
            valueSettings: {
              defaultValue: conv.defaultValue,
              defaultCurrencyCode: conv.currencyCode,
              alwaysUseDefaultValue: false,
            },
          },
        }],
      };

      console.log(`[CONV] Creating "${conv.name}" (category: ${conv.category})...`);
      const createResponse = await fetch(
        `${GOOGLE_ADS_API_BASE}/customers/${customerId}/conversionActions:mutate`,
        { method: "POST", headers: apiHeaders, body: JSON.stringify(createBody) }
      );

      if (!createResponse.ok) {
        const errText = await createResponse.text();
        console.error(`[CONV] Failed to create "${conv.name}":`, errText);
        
        // Check if it's a duplicate error
        if (errText.includes("DUPLICATE") || errText.includes("already exists")) {
          results.push({ name: conv.name, tag: conv.tag, status: "already_exists", error: "Duplicate detected by API" });
        } else {
          results.push({ name: conv.name, tag: conv.tag, status: "error", error: errText.substring(0, 300) });
        }
        continue;
      }

      const createData = await createResponse.json();
      const resourceName = createData.results?.[0]?.resourceName || "";
      const convId = resourceName.split("/").pop() || "";

      // Fetch tag snippet for the new conversion
      let conversionLabel = "";
      // Small delay to let Google Ads process
      await new Promise(r => setTimeout(r, 1000));
      
      const tagQuery = `SELECT conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.resource_name = '${resourceName}'`;
      const tagRes = await fetch(
        `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
        { method: "POST", headers: apiHeaders, body: JSON.stringify({ query: tagQuery }) }
      );
      if (tagRes.ok) {
        const tagData = await tagRes.json();
        const snippets = tagData.results?.[0]?.conversionAction?.tagSnippets;
        if (snippets && Array.isArray(snippets)) {
          conversionLabel = extractLabel(snippets);
        }
      }

      results.push({
        name: conv.name,
        tag: conv.tag,
        status: "created",
        conversionLabel: conversionLabel || `AW-${customerId}/${convId}`,
      });
      console.log(`[CONV] Created "${conv.name}" → ${conversionLabel || convId}`);
    }

    return new Response(JSON.stringify({ success: true, conversions: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[CONV] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
