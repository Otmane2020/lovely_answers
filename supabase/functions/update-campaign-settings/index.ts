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

    const body = await req.json();
    const { action, campaignId, campaignResourceName } = body;

    const apiHeaders: Record<string, string> = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN || "",
      "Content-Type": "application/json",
    };
    if (managerCustomerId && managerCustomerId.replace(/-/g, "") !== customerId) {
      apiHeaders["login-customer-id"] = managerCustomerId.replace(/-/g, "");
    }

    const campaignRN = campaignResourceName || `customers/${customerId}/campaigns/${campaignId}`;

    // ─── ACTION: get-settings ───
    if (action === "get-settings") {
      const query = `
        SELECT 
          campaign.id, campaign.name, campaign.status,
          campaign.bidding_strategy_type,
          campaign.maximize_conversions.target_cpa_micros,
          campaign.maximize_conversion_value.target_roas,
          campaign.target_cpa.target_cpa_micros,
          campaign.target_roas.target_roas,
          campaign_budget.amount_micros,
          campaign_budget.resource_name,
          campaign.advertising_channel_type,
          metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM campaign
        WHERE campaign.id = ${campaignId}
      `;

      const response = await fetch(
        `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
        { method: "POST", headers: apiHeaders, body: JSON.stringify({ query }) }
      );

      if (!response.ok) {
        const errText = await response.text();
        return new Response(JSON.stringify({ error: "Failed to fetch settings: " + errText.substring(0, 500) }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const row = data.results?.[0];
      if (!row) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const c = row.campaign;
      const budget = row.campaignBudget;
      const metrics = row.metrics;

      // Extract current settings
      let targetRoas: number | null = null;
      let targetCpaMicros: number | null = null;

      if (c.maximizeConversionValue?.targetRoas) {
        targetRoas = c.maximizeConversionValue.targetRoas;
      } else if (c.targetRoas?.targetRoas) {
        targetRoas = c.targetRoas.targetRoas;
      }

      if (c.maximizeConversions?.targetCpaMicros) {
        targetCpaMicros = Number(c.maximizeConversions.targetCpaMicros);
      } else if (c.targetCpa?.targetCpaMicros) {
        targetCpaMicros = Number(c.targetCpa.targetCpaMicros);
      }

      // Calculate suggestions based on performance
      const totalCost = Number(metrics?.costMicros || 0) / 1_000_000;
      const totalConversions = Number(metrics?.conversions || 0);
      const totalValue = Number(metrics?.conversionsValue || 0);
      const currentRoas = totalCost > 0 ? totalValue / totalCost : 0;
      const currentCpa = totalConversions > 0 ? totalCost / totalConversions : 0;

      const suggestions: Record<string, unknown> = {};
      
      if (currentRoas > 0) {
        suggestions.targetRoas = {
          current: targetRoas,
          conservative: Math.round(currentRoas * 0.8 * 100) / 100,
          moderate: Math.round(currentRoas * 100) / 100,
          aggressive: Math.round(currentRoas * 1.2 * 100) / 100,
          explanation: `ROAS actuel: ${currentRoas.toFixed(2)}x. Conservateur (-20%) = plus de volume. Agressif (+20%) = meilleure rentabilité mais moins de conversions.`,
        };
      }

      if (currentCpa > 0) {
        suggestions.targetCpa = {
          current: targetCpaMicros ? targetCpaMicros / 1_000_000 : null,
          conservative: Math.round(currentCpa * 1.2 * 100) / 100,
          moderate: Math.round(currentCpa * 100) / 100,
          aggressive: Math.round(currentCpa * 0.8 * 100) / 100,
          explanation: `CPA actuel: ${currentCpa.toFixed(2)}€. Conservateur (+20%) = plus de volume. Agressif (-20%) = meilleur coût mais moins de conversions.`,
        };
      }

      const currentBudget = Number(budget?.amountMicros || 0) / 1_000_000;
      suggestions.budget = {
        current: currentBudget,
        scaleUp: Math.round(currentBudget * 1.3),
        scaleDown: Math.max(5, Math.round(currentBudget * 0.7)),
        explanation: `Budget actuel: ${currentBudget.toFixed(0)}€/jour.`,
      };

      return new Response(JSON.stringify({
        success: true,
        settings: {
          campaignId: c.id,
          campaignName: c.name,
          status: c.status,
          channelType: c.advertisingChannelType,
          biddingStrategyType: c.biddingStrategyType,
          targetRoas,
          targetCpaMicros,
          budgetAmountMicros: Number(budget?.amountMicros || 0),
          budgetResourceName: budget?.resourceName,
          metrics: { cost: totalCost, conversions: totalConversions, value: totalValue, roas: currentRoas, cpa: currentCpa },
        },
        suggestions,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: update-settings ───
    if (action === "update-settings") {
      const { biddingStrategy, targetRoas, targetCpaMicros, budgetAmountMicros, budgetResourceName } = body;
      const operations: unknown[] = [];

      // 1. Update campaign bidding
      if (biddingStrategy) {
        const campaignUpdate: Record<string, unknown> = {
          resource_name: campaignRN,
        };
        const updateMask: string[] = [];

        if (biddingStrategy === "MAXIMIZE_CONVERSION_VALUE") {
          campaignUpdate.maximize_conversion_value = {};
          updateMask.push("maximize_conversion_value");
          if (targetRoas && targetRoas > 0) {
            campaignUpdate.maximize_conversion_value = { target_roas: targetRoas };
            updateMask.push("maximize_conversion_value.target_roas");
          }
        } else if (biddingStrategy === "MAXIMIZE_CONVERSIONS") {
          campaignUpdate.maximize_conversions = {};
          updateMask.push("maximize_conversions");
          if (targetCpaMicros && targetCpaMicros > 0) {
            campaignUpdate.maximize_conversions = { target_cpa_micros: String(targetCpaMicros) };
            updateMask.push("maximize_conversions.target_cpa_micros");
          }
        } else if (biddingStrategy === "TARGET_ROAS") {
          campaignUpdate.target_roas = { target_roas: targetRoas || 0 };
          updateMask.push("target_roas.target_roas");
        } else if (biddingStrategy === "TARGET_CPA") {
          campaignUpdate.target_cpa = { target_cpa_micros: String(targetCpaMicros || 0) };
          updateMask.push("target_cpa.target_cpa_micros");
        }

        operations.push({
          campaignOperation: {
            update: campaignUpdate,
            update_mask: updateMask.join(","),
          },
        });
      }

      // 2. Update budget
      if (budgetAmountMicros && budgetResourceName) {
        operations.push({
          campaignBudgetOperation: {
            update: {
              resource_name: budgetResourceName,
              amount_micros: String(budgetAmountMicros),
            },
            update_mask: "amount_micros",
          },
        });
      }

      if (!operations.length) {
        return new Response(JSON.stringify({ error: "No changes to apply" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use mutate endpoint
      const results: unknown[] = [];
      for (const op of operations) {
        let endpoint: string;
        let mutateBody: Record<string, unknown>;

        if ("campaignOperation" in (op as Record<string, unknown>)) {
          endpoint = `${GOOGLE_ADS_API_BASE}/customers/${customerId}/campaigns:mutate`;
          mutateBody = { operations: [(op as Record<string, unknown>).campaignOperation] };
        } else {
          endpoint = `${GOOGLE_ADS_API_BASE}/customers/${customerId}/campaignBudgets:mutate`;
          mutateBody = { operations: [(op as Record<string, unknown>).campaignBudgetOperation] };
        }

        const response = await fetch(endpoint, {
          method: "POST", headers: apiHeaders, body: JSON.stringify(mutateBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("[UPDATE-SETTINGS] Mutate failed:", errText.substring(0, 1000));
          return new Response(JSON.stringify({ error: "Update failed: " + errText.substring(0, 500) }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const resData = await response.json();
        results.push(resData);
      }

      // Update local DB
      if (budgetAmountMicros) {
        await supabase
          .from("campaigns_sync")
          .update({ budget_amount_micros: budgetAmountMicros })
          .eq("google_campaign_id", String(campaignId))
          .eq("user_id", user.id);
      }

      if (biddingStrategy) {
        await supabase
          .from("campaigns_sync")
          .update({ bidding_strategy_type: biddingStrategy })
          .eq("google_campaign_id", String(campaignId))
          .eq("user_id", user.id);
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[UPDATE-SETTINGS] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
