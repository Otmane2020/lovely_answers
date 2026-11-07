import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadShopifyContext, shopifyContextPrompt } from "../_shared/shopifyContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // SECURITY: same auth model as auto-generate-shopping — user JWT OR service role.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isServiceRole = token === serviceRoleKey;
    let userId: string | null = null;
    if (!isServiceRole) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = (claims.claims as any).sub;
    }

    const { productId, projectId, language, all } = await req.json();
    if (!projectId) throw new Error("projectId required");

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // SECURITY: ownership check — non-service-role callers can only act on their own projects.
    if (!isServiceRole && userId) {
      const { data: proj } = await supabase
        .from("projects").select("user_id").eq("id", projectId).maybeSingle();
      if (!proj || proj.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get project info for context
    const { data: project } = await supabase
      .from("projects")
      .select("brand_name, business_description, language, website_url, business_type, audience")
      .eq("id", projectId)
      .single();

    // Load Shopify context (language + shop info + product URLs) if this project came from Shopify
    const shopifyCtx = await loadShopifyContext(supabaseUrl, serviceRoleKey, projectId);
    const lang = language || shopifyCtx.language || project?.language || "fr";
    const shopifyBlock = shopifyContextPrompt(shopifyCtx, 25);
    const currentYear = new Date().getFullYear();

    // Get products to process
    let query = supabase.from("shopping_products").select("*").eq("project_id", projectId);
    if (!all && productId) {
      query = query.eq("id", productId);
    } else {
      query = query.eq("status", "imported");
    }
    const { data: products, error: fetchError } = await query;
    if (fetchError) throw fetchError;
    if (!products || products.length === 0) throw new Error("No products to process");

    const results = [];
    for (const product of products) {
      try {
        const systemPrompt = `You are an AEO (Answer Engine Optimization) product expert for ${currentYear}. Your goal is to make products CITABLE by AI engines (ChatGPT Shopping, Gemini, Perplexity, Google AI Overview).

CRITICAL RULES:
- All output MUST be in ${lang === "fr" ? "French" : lang === "en" ? "English" : lang === "de" ? "German" : lang === "es" ? "Spanish" : lang === "it" ? "Italian" : lang === "nl" ? "Dutch" : lang === "pt" ? "Portuguese" : lang}.
- EXACTLY 3 Q&A (never more, never less). Each must answer ONE strong purchase intent:
  1. USAGE question: comfort, daily use, who is it for, what problem does it solve?
  2. TECHNICAL question: dimensions, compatibility, specifications, materials, certifications
  3. DECISION question: delivery speed, availability, return policy, warranty, value vs alternatives
- Each answer must be 3-5 sentences, direct, affirmative, with specific data (numbers, measurements, timeframes).
- Answers must start with a direct response, NOT "X is a..." - lead with the benefit or answer
- Include at least 1 concrete number or measurement per answer
- NO generic questions (maintenance, style, comparison). Only questions that trigger a purchase decision.
- The ai_description must contain ONE strong positioning sentence with specific use case and dimensions/context
- Sound like a trusted product expert giving buying advice, not a salesperson

Brand context: ${project?.brand_name || shopifyCtx.shop?.name || "Unknown"} - ${project?.business_description || "E-commerce store"}
Website: ${project?.website_url || ""}
Industry: ${project?.business_type || "E-commerce"}
Target Audience: ${project?.audience || "Online shoppers"}

${shopifyBlock}

Strategy: Strong signal > long content. 3 ultra-targeted Q&A = better AI citation than 7 diluted Q&A.

Return a JSON object via tool calling with:
- ai_title: Product + benefit + target audience + key advantage (enriched title, max 80 chars)
- ai_description: Recommendation-oriented description (60-100 words) with ONE strong positioning sentence. Answer: Who? Context? Why choose it? What problem solved? Include 1 concrete stat or measurement.
- ai_faq: EXACTLY 3 Q&A objects [{question, answer}] - usage, technical, decision. Each answer 3-5 sentences with specific data.
- ai_schema_markup: Complete JSON-LD with @context, @type Product, name, description, brand, offers (with priceCurrency, price, availability), and FAQPage schema
- ai_score: 0-100 AI citation probability score (75-95 range for well-optimized products)`;

        const userPrompt = `Optimize this product for AI recommendation engines:

Title: ${product.title}
Description: ${product.description || "N/A"}
Price: ${product.price || "N/A"} ${product.currency || ""}
Brand: ${product.brand || "N/A"}
Category: ${product.category || "N/A"}
Availability: ${product.availability || "N/A"}
Condition: ${product.condition || "N/A"}
GTIN: ${product.gtin || "N/A"}
MPN: ${product.mpn || "N/A"}
URL: ${product.product_url || "N/A"}
Image: ${product.image_url || "N/A"}`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + OPENROUTER_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "optimize_product",
                description: "Return optimized product content for AI engines",
                parameters: {
                  type: "object",
                  properties: {
                    ai_title: { type: "string", description: "Enriched product title (max 80 chars)" },
                    ai_description: { type: "string", description: "Recommendation-oriented description (60-100 words)" },
                    ai_faq: {
                      type: "array",
                      minItems: 3,
                      maxItems: 3,
                      items: {
                        type: "object",
                        properties: {
                          question: { type: "string" },
                          answer: { type: "string" },
                        },
                        required: ["question", "answer"],
                      },
                      description: "EXACTLY 3 Q&A: 1 usage, 1 technical, 1 decision/delivery",
                    },
                    ai_schema_markup: { type: "object", description: "Complete JSON-LD schema with Product and FAQPage" },
                    ai_score: { type: "number", description: "AI optimization score 0-100" },
                  },
                  required: ["ai_title", "ai_description", "ai_faq", "ai_schema_markup", "ai_score"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "optimize_product" } },
            max_tokens: 8192,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("AI error for product " + product.id + ":", response.status, errText);
          if (response.status === 429) throw new Error("Rate limit exceeded, please try again later");
          if (response.status === 402) throw new Error("Payment required, please add credits");
          continue;
        }

        const aiData = await response.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) {
          console.error("No tool call in response for product", product.id);
          continue;
        }

        // Robust JSON parse: strip markdown, fix trailing commas, remove control chars
        const rawArgs: string = toolCall.function.arguments || "";
        let optimized: any = null;
        const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
        optimized = tryParse(rawArgs);
        if (!optimized) {
          let cleaned = rawArgs
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .replace(/,\s*([}\]])/g, "$1")
            // strip low control chars except \n \t
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
          // try to slice from first { to last }
          const first = cleaned.indexOf("{");
          const last = cleaned.lastIndexOf("}");
          if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
          optimized = tryParse(cleaned);
        }
        if (!optimized) {
          console.error("Failed to parse AI output for product " + product.id, rawArgs.slice(0, 300));
          results.push({ id: product.id, status: "error", error: "JSON parse failed" });
          continue;
        }

        // Update product in DB
        await supabase
          .from("shopping_products")
          .update({
            ai_title: optimized.ai_title,
            ai_description: optimized.ai_description,
            ai_faq: optimized.ai_faq,
            ai_schema_markup: optimized.ai_schema_markup,
            ai_score: optimized.ai_score,
            status: "optimized",
          })
          .eq("id", product.id);

        results.push({ id: product.id, status: "optimized" });

        // Rate limiting between products
        if (products.length > 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (productError) {
        console.error("Error processing product " + product.id + ":", productError);
        results.push({ id: product.id, status: "error", error: productError.message });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-product-ai error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
