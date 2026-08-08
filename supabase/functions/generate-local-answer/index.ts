import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { reviewWithClaude } from "../_shared/claude-review.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { projectId, question, businessName, location, businessContext } = await req.json();

    if (!question) {
      return new Response(
        JSON.stringify({ error: "Question is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get project details for additional context
    let projectContext = "";
    let language = "en";
    
    if (projectId) {
      const { data: project } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      const { data: settings } = await supabase
        .from("generation_settings")
        .select("*")
        .eq("project_id", projectId)
        .single();

      projectContext = settings?.business_description || project?.business_description || "";
      language = settings?.language || project?.language || "en";
    }

    // Build rich context from Places API data
    const contextParts = [];
    
    if (businessContext?.rating) {
      contextParts.push("Rating: " + businessContext.rating + "/5 (" + (businessContext.reviewCount || 0) + " reviews)");
    }
    if (businessContext?.types?.length > 0) {
      contextParts.push("Business Type: " + businessContext.types.slice(0, 3).join(", "));
    }
    if (businessContext?.phone) {
      contextParts.push("Phone: " + businessContext.phone);
    }
    if (businessContext?.website) {
      contextParts.push("Website: " + businessContext.website);
    }
    if (businessContext?.openingHours?.length > 0) {
      contextParts.push("Hours: " + businessContext.openingHours.join("; "));
    }
    if (businessContext?.priceLevel) {
      contextParts.push("Price Level: " + businessContext.priceLevel + "/4");
    }
    if (businessContext?.reviews?.length > 0) {
      const reviewTexts = businessContext.reviews
        .slice(0, 3)
        .map((r: any) => '"' + r.text.substring(0, 120) + '..."')
        .join(" | ");
      contextParts.push("Customer Feedback: " + reviewTexts);
    }

    const currentYear = new Date().getFullYear();

    const systemPrompt = language === "fr"
      ? `Tu es un expert AEO local. Tu rediges des reponses RICHES et CITABLES par ChatGPT, Gemini, Perplexity et Claude quand les utilisateurs posent des questions sur des etablissements locaux.

REGLES ABSOLUES:
1. Reponse directe dans la premiere phrase (repond clairement a la question)
2. 250-400 mots minimum - les reponses courtes ne sont PAS citees par les IA
3. Utilise le markdown: ## sous-titres, **gras**, listes a puces ou numerotees
4. Inclure des donnees concretes: horaires exacts, prix, coordonnees, note
5. Mentionner le nom de l'etablissement naturellement 2-4 fois
6. Aucun superlatif marketing ("meilleur", "incroyable", "unique")
7. Ton NEUTRE et expert - pas de publicite
8. Inclure des conseils pratiques et erreurs a eviter`
      : `You are a local AEO expert. You write RICH and CITABLE answers for ChatGPT, Gemini, Perplexity and Claude when users ask questions about local businesses.

ABSOLUTE RULES:
1. Direct answer in the first sentence (clearly answers the question)
2. 250-400 words minimum - short answers are NOT cited by AI engines
3. Use markdown: ## subheadings, **bold**, bullet or numbered lists
4. Include concrete data: exact hours, prices, contact info, rating
5. Mention the business name naturally 2-4 times
6. No marketing superlatives ("best", "amazing", "unique")
7. NEUTRAL expert tone - no advertising
8. Include practical tips and mistakes to avoid`;

    const userPrompt = language === "fr"
      ? `Informations sur l'etablissement:
Nom: ${businessName || "Etablissement local"}
Localisation: ${location || "Zone locale"}
${contextParts.length > 0 ? "\nDetails:\n" + contextParts.join("\n") : ""}
${projectContext ? "\nContexte additionnel: " + projectContext : ""}

Question: "${question}"

STRUCTURE OBLIGATOIRE:
1. Premiere phrase = reponse directe avec donnee concrete (chiffre, horaire, prix)
2. Paragraphe de contexte avec informations pratiques detaillees
3. Liste de 3-5 points cles avec **donnees en gras**
4. Section "A savoir" avec conseil pratique ou erreur a eviter
5. Mentionner ${businessName} naturellement 2-4 fois
6. Inclure le contexte temporel (${currentYear})

Retourne UNIQUEMENT le texte de la reponse en markdown. Pas de JSON. Pas de guillemets autour. 250-400 mots.`
      : `Business Information:
Name: ${businessName || "Local Business"}
Location: ${location || "Local area"}
${contextParts.length > 0 ? "\nDetails:\n" + contextParts.join("\n") : ""}
${projectContext ? "\nAdditional Context: " + projectContext : ""}

Question: "${question}"

MANDATORY STRUCTURE:
1. First sentence = direct answer with concrete data (number, hours, price)
2. Context paragraph with detailed practical information
3. List of 3-5 key points with **data in bold**
4. "Good to know" section with practical tip or mistake to avoid
5. Mention ${businessName} naturally 2-4 times
6. Include temporal context (${currentYear})

Return ONLY the answer text in markdown. No JSON. No quotes around it. 250-400 words.`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        temperature: 0.5,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error("AI request failed: " + aiResponse.status);
    }

    const aiData = await aiResponse.json();
    const rawAnswer = aiData.choices?.[0]?.message?.content || "";

    const reviewed = await reviewWithClaude({
      content: rawAnswer.trim(),
      contentType: "local_answer",
      brand: businessName,
      question,
      topic: location,
    });

    return new Response(
      JSON.stringify({
        answer: reviewed.content.trim(),
        question,
        businessName,
        location,
        reviewed: reviewed.reviewed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error generating local answer:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
