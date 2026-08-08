import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "https://esm.sh/svix@1.24.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

// Webhook to receive incoming emails from Resend
// Endpoint: https://pnohfokjlhpzrkczruju.supabase.co/functions/v1/email-webhook
// Configure at: https://resend.com/webhooks (event: email.received)

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // SECURITY: verify Svix signature so attackers cannot inject fake emails.
    const rawBody = await req.text();
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("[email-webhook] RESEND_WEBHOOK_SECRET not configured — refusing request");
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      const wh = new Webhook(webhookSecret);
      wh.verify(rawBody, {
        "svix-id": req.headers.get("svix-id") ?? "",
        "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
        "svix-signature": req.headers.get("svix-signature") ?? "",
      });
    } catch (err) {
      console.error("[email-webhook] Signature verification failed:", (err as Error).message);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    console.log("[email-webhook] Received:", JSON.stringify(payload).slice(0, 500));

    const eventType = payload.type;
    const emailData = payload.data || payload;

    // Handle inbound email
    if (eventType === "email.received" || eventType === "inbound.email" || payload.from) {
      // Resend inbound payload formats vary; try multiple paths
      const fromRaw = emailData.from || payload.from || "";
      const fromEmail = typeof fromRaw === "string"
        ? (fromRaw.match(/<(.+?)>/)?.[1] || fromRaw).trim().toLowerCase()
        : (fromRaw.email || "").toLowerCase();
      const fromName = typeof fromRaw === "string"
        ? fromRaw.replace(/<.+?>/, "").trim().replace(/^"|"$/g, "")
        : fromRaw.name || null;

      const toRaw = emailData.to || payload.to || "";
      const toEmail = Array.isArray(toRaw) ? toRaw[0] : (typeof toRaw === "string" ? toRaw : toRaw?.email || "");

      const subject = emailData.subject || payload.subject || "(no subject)";
      const bodyText = emailData.text || payload.text || emailData.plain || "";
      const bodyHtml = emailData.html || payload.html || "";
      const resendId = emailData.email_id || emailData.id || payload.id || null;

      // Save EVERY incoming email
      const { data: inserted, error: insertErr } = await supabase
        .from("inbox_emails")
        .insert({
          from_email: fromEmail,
          from_name: fromName,
          to_email: toEmail,
          subject,
          body_text: bodyText,
          body_html: bodyHtml,
          resend_email_id: resendId,
          raw_payload: payload,
        })
        .select()
        .single();

      if (insertErr) {
        console.error("[email-webhook] Insert inbox_emails error:", insertErr);
      } else {
        console.log("[email-webhook] Saved inbox email:", inserted?.id);
      }

      // Forward to admin notification address
      try {
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        if (RESEND_API_KEY) {
          const ADMIN_NOTIFY = "oben.rockman@gmail.com";
          const fwdSubject = `[AutoPilot Inbox] ${subject}`;
          const fwdHtml = `
            <div style="font-family:-apple-system,sans-serif;line-height:1.6;color:#333;max-width:600px;">
              <div style="background:#f4f4f5;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px;">
                <p style="margin:0"><strong>From:</strong> ${fromName ? `${fromName} &lt;${fromEmail}&gt;` : fromEmail}</p>
                <p style="margin:4px 0 0"><strong>To:</strong> ${toEmail}</p>
                <p style="margin:4px 0 0"><strong>Subject:</strong> ${subject}</p>
              </div>
              ${bodyHtml || `<pre style="white-space:pre-wrap;font-family:inherit;">${(bodyText || "").replace(/</g,"&lt;")}</pre>`}
              <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
              <p style="font-size:12px;color:#888;">📬 Reçu sur support@autopilotgeo.com — <a href="https://app.autopilotgeo.com/superadmin">Ouvrir la boîte de réception</a></p>
            </div>`;
          const fwdRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "AutoPilot Inbox <support@autopilotgeo.com>",
              to: [ADMIN_NOTIFY],
              subject: fwdSubject,
              html: fwdHtml,
              reply_to: fromEmail || undefined,
            }),
          });
          if (!fwdRes.ok) {
            console.error("[email-webhook] Forward failed:", await fwdRes.text());
          } else {
            console.log("[email-webhook] Forwarded to admin");
          }
        }
      } catch (fwdErr) {
        console.error("[email-webhook] Forward error:", fwdErr);
      }
      // Also try to link to existing ticket if from a known user
      if (fromEmail) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", fromEmail)
          .maybeSingle();

        if (profile) {
          const { data: ticket } = await supabase
            .from("support_tickets")
            .select("id")
            .eq("user_id", profile.id)
            .in("status", ["open", "in_progress"])
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (ticket) {
            await supabase.from("support_messages").insert({
              ticket_id: ticket.id,
              sender_type: "user",
              message: bodyText || bodyHtml,
            });
            await supabase
              .from("support_tickets")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", ticket.id);
            console.log("[email-webhook] Linked to ticket:", ticket.id);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, action: "email_received" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`[email-webhook] Event ${eventType} ignored`);
    return new Response(JSON.stringify({ success: true, event: eventType }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[email-webhook] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
