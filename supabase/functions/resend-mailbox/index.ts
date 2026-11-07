import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const { action, id } = await req.json();

    if (action === "list_sent") {
      // Resend API: list emails (sent)
      const res = await fetch("https://api.resend.com/emails?limit=100", {
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}` },
      });
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, data: data.data || data }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (action === "get_email" && id) {
      const res = await fetch(`https://api.resend.com/emails/${id}`, {
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}` },
      });
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    throw new Error("Unknown action");
  } catch (error: any) {
    console.error("[resend-mailbox] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
