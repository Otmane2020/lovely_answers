import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { focus, campaign_id, businessContext } = await req.json();
    // focus: "all" | "ad_groups" | "keywords" | "roas" | "strategy" | "conversions"

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch campaigns
    let campaignsQuery = adminClient
      .from("campaigns_sync")
      .select("*")
      .eq("user_id", userId)
      .order("spend_7d", { ascending: false });

    if (campaign_id) {
      campaignsQuery = campaignsQuery.eq("google_campaign_id", campaign_id);
    }

    const { data: campaigns } = await campaignsQuery;
    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ error: "Aucune campagne trouvée. Synchronisez d'abord." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch keywords and ads for all campaigns
    const campaignIds = campaigns.map(c => c.id);

    const [{ data: keywords }, { data: ads }] = await Promise.all([
      adminClient
        .from("keywords_sync")
        .select("*")
        .eq("user_id", userId)
        .in("campaign_sync_id", campaignIds)
        .order("clicks", { ascending: false })
        .limit(200),
      adminClient
        .from("ads_sync")
        .select("*")
        .eq("user_id", userId)
        .in("campaign_sync_id", campaignIds)
        .order("clicks", { ascending: false })
        .limit(100),
    ]);

    // Build context for AI
    const totalSpend = campaigns.reduce((s, c) => s + (c.spend_7d || 0), 0);
    const totalClicks = campaigns.reduce((s, c) => s + (c.clicks_7d || 0), 0);
    const totalConversions = campaigns.reduce((s, c) => s + (c.conversions_7d || 0), 0);
    const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue_7d || 0), 0);
    const avgCTR = campaigns.reduce((s, c) => s + (c.ctr_7d || 0), 0) / campaigns.length;
    const globalROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const globalCPA = totalConversions > 0 ? totalSpend / totalConversions : 0;

    const campaignsSummary = campaigns.map(c => ({
      name: c.name,
      status: c.status,
      type: c.advertising_channel_type,
      bidding: c.bidding_strategy_type,
      budget_day: c.budget_amount_micros ? (c.budget_amount_micros / 1000000).toFixed(2) : "?",
      spend_7d: (c.spend_7d || 0).toFixed(2),
      clicks_7d: c.clicks_7d || 0,
      impressions_7d: c.impressions_7d || 0,
      ctr_7d: ((c.ctr_7d || 0) * 100).toFixed(2) + "%",
      cpc_7d: (c.cpc_7d || 0).toFixed(2),
      conversions_7d: (c.conversions_7d || 0).toFixed(1),
      revenue_7d: (c.revenue_7d || 0).toFixed(2),
      roas_7d: (c.roas_7d || 0).toFixed(2),
      primary_status: c.primary_status,
    }));

    const keywordsSummary = (keywords || []).slice(0, 100).map(k => ({
      keyword: k.keyword_text,
      match: k.match_type,
      qs: k.quality_score,
      qs_creative: k.quality_score_creative,
      qs_landing: k.quality_score_landing,
      qs_ctr: k.quality_score_expected_ctr,
      status: k.status,
      clicks: k.clicks || 0,
      impressions: k.impressions || 0,
      cost: k.cost_micros ? (k.cost_micros / 1000000).toFixed(2) : "0",
      conversions: k.conversions || 0,
      ad_group: k.ad_group_name,
      cpc_bid: k.cpc_bid_micros ? (k.cpc_bid_micros / 1000000).toFixed(2) : null,
      first_page_cpc: k.first_page_cpc_micros ? (k.first_page_cpc_micros / 1000000).toFixed(2) : null,
    }));

    const adsSummary = (ads || []).slice(0, 50).map(a => {
      const headlines = Array.isArray(a.headlines)
        ? a.headlines.map((h: any) => typeof h === "string" ? h : h.text || "")
        : [];
      const descriptions = Array.isArray(a.descriptions)
        ? a.descriptions.map((d: any) => typeof d === "string" ? d : d.text || "")
        : [];
      return {
        ad_group: a.ad_group_name,
        status: a.status,
        strength: a.ad_strength,
        headlines,
        descriptions,
        urls: a.final_urls,
        clicks: a.clicks || 0,
        impressions: a.impressions || 0,
        cost: a.cost_micros ? (a.cost_micros / 1000000).toFixed(2) : "0",
        conversions: a.conversions || 0,
      };
    });

    // Build focus-specific prompt
    let focusInstruction = "";
    switch (focus) {
      case "keywords":
        focusInstruction = `
FOCUS: Analyse et tri des mots-clés
Tu DOIS structurer ta réponse avec ces sections EXACTES:

### 🔴 Mots-clés à EXCLURE (ajouter en négatifs)
Pour chaque mot-clé: nom, raison, coût gaspillé, action précise
- Critère: dépenses > 1€ et 0 conversions, ou CTR < 0.5% avec dépenses significatives
- Inclure aussi des suggestions de mots-clés négatifs à ajouter (pas dans les données mais à anticiper)

### 🟡 Mots-clés à OPTIMISER
Pour chaque mot-clé: nom, QS actuel, problème identifié (landing/pertinence/CTR attendu), action
- Critère: QS < 5, ou CPC trop élevé vs first page CPC

### 🟢 Mots-clés à CONSERVER et BOOSTER
Pour chaque mot-clé: nom, conversions, ROAS, action pour augmenter (bid increase, budget)
- Critère: conversions > 0, bon QS

### 🔵 Mots-clés à AJOUTER
Suggestions de nouveaux mots-clés basés sur l'analyse des performances actuelles
- Pour chaque suggestion: mot-clé, match type recommandé, CPC estimé, raison

Pour chaque recommandation, donne une **Action concrète :** avec des détails précis.`;
        break;
      case "ad_groups":
        focusInstruction = `
FOCUS: Synthèse par Ad Group avec actions
Tu DOIS structurer ta réponse avec ces sections:

### 🔴 Ad Groups à METTRE EN PAUSE
Pour chaque: nom, dépenses, 0 conversions, raison du stop
- Critère: dépenses > 5€ et 0 conversions, ou CTR < 1%

### 🟢 Ad Groups à CONSERVER
Pour chaque: nom, métriques clés, force de l'annonce
- Critère: conversions > 0 ou bon CTR

### 🔵 Ad Groups à CRÉER
Suggestions de nouveaux groupes d'annonces pour couvrir des segments manquants
- Pour chaque: nom suggéré, mots-clés à inclure, headlines suggérés

### 🟡 Annonces à AMÉLIORER
Pour chaque annonce: headlines actuels vs recommandés, descriptions à changer
- Focalise sur l'Ad Strength (POOR/AVERAGE → GOOD/EXCELLENT)

Pour chaque recommandation, donne une **Action concrète :** avec des détails précis.`;
        break;
      case "roas":
        focusInstruction = `
FOCUS: Optimisation ROAS & Budget
Tu DOIS structurer ta réponse avec ces sections:

## Analyse Globale ROAS
- ROAS actuel vs objectif recommandé
- Répartition du budget: quelles campagnes reçoivent trop/pas assez

### 🔴 Campagnes à RÉDUIRE/PAUSER (ROAS < 1)
Pour chaque: nom, dépenses, revenue, ROAS actuel, perte estimée
- Action: réduire budget de X% ou pauser

### 🟢 Campagnes à SCALER (ROAS > 2)
Pour chaque: nom, ROAS actuel, budget actuel, budget recommandé, revenue potentiel
- Action: augmenter budget de X€/jour

### 🟡 Enchères à AJUSTER
Recommandations de stratégie d'enchères par campagne
- tROAS vs Max Conversions vs Manual CPC: quand et pourquoi

### 💰 Plan de réallocation budget
Tableau récapitulatif: campagne | budget actuel | budget recommandé | impact estimé

Pour chaque recommandation, chiffre l'**Impact potentiel :** en € ou %.`;
        break;
      case "strategy":
        focusInstruction = `
FOCUS: Quick Wins & Stratégie
Tu DOIS structurer ta réponse avec ces sections:

## Diagnostic express
3-5 points clés: ce qui marche et ce qui ne marche pas

### ⚡ Quick Wins (0-2 jours)
5-10 actions rapides classées par impact estimé
Pour chaque: action, temps, impact estimé
Exemples: ajuster un bid, pauser une campagne, ajouter un négatif, modifier un headline

### 🎯 Améliorations moyen-terme (1-2 semaines)  
3-5 actions structurelles
Exemples: restructurer ad groups, tester nouvelles enchères, créer campagne PMax

### 🔮 Recommandations stratégiques
Vision à 30-90 jours pour améliorer les performances globales
- Types de campagnes manquants
- Tests A/B à lancer
- Structure de compte idéale

Pour chaque recommandation, donne une **Action concrète :** avec des détails précis.`;
        break;
      case "conversions":
        focusInstruction = `
FOCUS: Génération d'objectifs de conversion
Business: ${businessContext?.brandName || "AutoPilot Geo"} - ${businessContext?.businessDescription || "AI SEO platform"}
Website: ${businessContext?.websiteUrl || "https://autopilotgeo.com"}

Analyse le tunnel de conversion du site et propose des objectifs Google Ads.
Retourne un JSON avec une clé "goals" contenant un tableau d'objets:
[
  { "name": "Nom de l'objectif", "type": "SIGNUP|LEAD|PURCHASE|PAGE_VIEW|CHECKOUT", "value": valeur_en_euros_ou_null, "tag": "event_tag_name" }
]

Propose 3-7 objectifs de conversion pertinents pour ce type de business (SaaS/tool).
Exemples types: inscription, onboarding, vue pricing, début checkout, achat, upgrade, usage feature clé.
RETOURNE UNIQUEMENT LE JSON, pas de markdown.`;
        break;
      default: // "all"
        focusInstruction = `
FOCUS: Audit complet du compte
Couvre TOUS les aspects: mots-clés, ad groups, annonces, ROAS, enchères, budget.
Donne une vue synthétique avec les TOP 5 actions prioritaires classées par impact estimé.
Pour chaque action, estime l'impact en €/mois.`;
    }

    const systemPrompt = `Tu es un expert Google Ads senior avec 15 ans d'expérience. Tu analyses des données réelles de campagnes Google Ads et fournis des recommandations actionnables et précises.

Règles:
- Réponds TOUJOURS en français
- Sois direct et actionnable, pas de généralités
- Utilise des données chiffrées pour appuyer tes recommandations
- Classe les recommandations par impact estimé (🔴 Critique, 🟡 Important, 🟢 Amélioration)
- Pour chaque recommandation, estime l'impact potentiel en €/mois ou en %
- Donne des actions concrètes (pas "améliorez vos annonces" mais "ajoutez le mot-clé X dans le titre 1")

STRUCTURE OBLIGATOIRE:
1. Commence par un résumé de 3-4 lignes mentionnant les KPIs clés (dépenses, clics, conversions, CTR, ROAS)
2. Puis une section "## Analyse Globale" avec le diagnostic
3. Puis des sections "### 🔴 Critique : [titre]" ou "### 🟡 Important : [titre]" ou "### 🟢 Amélioration : [titre]"
4. Dans chaque section, inclure des points "**Action concrète :**" avec des instructions précises
5. Pour chaque action, estimer l'impact : "**Impact potentiel :** +X€/mois ou X% d'amélioration"

NOTE IMPORTANTE: Le suivi des conversions Google Ads est DÉJÀ configuré sur ce site (gtag AW-2652268707 avec events: sign_up, onboarding, checkout, purchase, pricing_view). Ne recommande PAS de l'installer, il est déjà en place.

${focusInstruction}`;

    const userPrompt = `Analyse ces données Google Ads (7 derniers jours):

## KPIs Globaux
- Dépenses: ${totalSpend.toFixed(2)}€
- Clics: ${totalClicks}
- Conversions: ${totalConversions.toFixed(1)}
- Revenue: ${totalRevenue.toFixed(2)}€
- ROAS global: ${globalROAS.toFixed(2)}
- CPA moyen: ${globalCPA.toFixed(2)}€
- CTR moyen: ${(avgCTR * 100).toFixed(2)}%

## Campagnes (${campaigns.length})
${JSON.stringify(campaignsSummary, null, 2)}

## Mots-clés (top ${keywordsSummary.length})
${JSON.stringify(keywordsSummary, null, 2)}

## Annonces (top ${adsSummary.length})
${JSON.stringify(adsSummary, null, 2)}

Fournis une analyse détaillée avec des recommandations actionnables classées par impact.`;

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: focus !== "conversions",
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, réessayez dans quelques instants." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits AI insuffisants." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For conversions focus, parse JSON response
    if (focus === "conversions") {
      const aiData = await aiResponse.json();
      let content = aiData.choices?.[0]?.message?.content || "";
      content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      try {
        const parsed = JSON.parse(content);
        const goals = Array.isArray(parsed) ? parsed : (parsed.goals || []);
        return new Response(JSON.stringify({ goals }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        console.error("Failed to parse conversions response:", content);
        return new Response(JSON.stringify({ goals: [], error: "Failed to parse AI response" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Stream the response back
    return new Response(aiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error: any) {
    console.error("analyze-google-ads error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
