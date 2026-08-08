import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, businessName, searchQuery, location } = await req.json();

    if (!businessName || !searchQuery) {
      return new Response(
        JSON.stringify({ error: "Business name and search query are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate grid points around the location
    const gridSize = 5;
    const heatmapResults = [];

    // Use AI to simulate local visibility check
    const prompt = `You are analyzing local search visibility for a business.
Business: ${businessName}
Search Query: "${searchQuery}"
Location: ${location || "Default area"}

Generate a realistic 5x5 grid of visibility scores representing different geographic points around the business location.
For each of the 25 points, provide:
- position: ranking position (1-20, where 1 is best)
- trend: "up", "down", or "stable"

Return a JSON array of 25 objects.

Consider that:
- Points closer to the business center should generally rank better
- Some variation is expected due to local competition
- Realistic positions typically range from 1-15 for well-optimized businesses

Return ONLY the JSON array, no other text.`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error("AI request failed");
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse the AI response
    let heatmap = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        heatmap = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      // Generate fallback data
      heatmap = Array.from({ length: 25 }, (_, i) => ({
        position: Math.floor(Math.random() * 15) + 1,
        trend: ["up", "down", "stable"][Math.floor(Math.random() * 3)],
      }));
    }

    // Calculate average position
    const avgPosition = heatmap.reduce((sum: number, cell: any) => sum + cell.position, 0) / heatmap.length;

    return new Response(
      JSON.stringify({
        heatmap,
        averagePosition: Math.round(avgPosition * 10) / 10,
        searchQuery,
        businessName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error checking local visibility:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
