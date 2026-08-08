import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "AutoPilot Geo <support@autopilotgeo.com>";

interface EmailRequest {
  type: "welcome" | "ticket_created" | "ticket_reply" | "custom" | "test";
  to: string;
  name?: string;
  subject?: string;
  ticketId?: string;
  ticketSubject?: string;
  message?: string;
  html?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: EmailRequest = await req.json();
    console.log("[send-email] Request:", data.type, data.to);

    let subject: string;
    let html: string;

    switch (data.type) {
      case "welcome":
        subject = "Welcome to AutoPilot Geo! 🎉";
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #7c3aed; margin: 0;">Welcome to AutoPilot Geo! 🎉</h1>
            </div>

            <p>Hi ${data.name || "there"},</p>

            <p>Thanks for joining! We're thrilled to have you on board.</p>

            <p>With AutoPilot Geo, you can:</p>
            <ul>
              <li>🚀 Generate AEO answers optimized for AI search engines</li>
              <li>📝 Create blog articles automatically</li>
              <li>📊 Track performance with Google Search Console</li>
              <li>🔗 Publish directly to WordPress, Shopify, Wix and more</li>
            </ul>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://app.autopilotgeo.com/dashboard" style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">Go to my dashboard</a>
            </div>

            <p>If you have any questions, feel free to reach out to support.</p>

            <p>Talk soon,<br><strong>The AutoPilot Geo Team</strong></p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
              AutoPilot Geo — Optimize your content for the AI era<br>
              <a href="https://autopilotgeo.com" style="color: #7c3aed;">autopilotgeo.com</a>
            </p>
          </body>
          </html>
        `;
        break;

      case "ticket_created":
        subject = `Ticket received: ${data.ticketSubject || "Your request"}`;
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #7c3aed;">We've received your request 📩</h2>

            <p>Hi ${data.name || "there"},</p>

            <p>Your support ticket has been created successfully. Our team will review it and get back to you as soon as possible.</p>

            <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Subject:</strong> ${data.ticketSubject}</p>
              <p style="margin: 10px 0 0;"><strong>Your message:</strong></p>
              <p style="margin: 5px 0 0; color: #555;">${data.message}</p>
            </div>

            <p>You can track your ticket status from your dashboard.</p>

            <p>Best regards,<br><strong>The AutoPilot Geo Support Team</strong></p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
              This email was sent automatically. Reply directly to this email to continue the conversation.
            </p>
          </body>
          </html>
        `;
        break;

      case "ticket_reply":
        subject = `Reply to your ticket: ${data.ticketSubject || "Support"}`;
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #7c3aed;">New reply to your ticket 💬</h2>

            <p>Hi ${data.name || "there"},</p>

            <p>Our support team has replied to your request:</p>

            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #22c55e; margin: 20px 0;">
              <p style="margin: 0; white-space: pre-wrap;">${data.message}</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://app.autopilotgeo.com/support" style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">View conversation</a>
            </div>

            <p>Best regards,<br><strong>The AutoPilot Geo Support Team</strong></p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
              Reply directly to this email to continue the conversation.
            </p>
          </body>
          </html>
        `;
        break;

      case "test":
        subject = "✅ Test email — AutoPilot Geo";
        html = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #7c3aed;">Test email successful! ✅</h1>
            </div>
            <p>Hi ${data.name || "there"},</p>
            <p>This is a test email sent from <strong>AutoPilot Geo</strong>.</p>
            <p>If you received this email, your setup is working correctly.</p>
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #22c55e; margin: 20px 0;">
              <p style="margin: 0;">📧 Sender: <strong>support@autopilotgeo.com</strong></p>
              <p style="margin: 5px 0 0;">🕐 Sent at: <strong>${new Date().toUTCString()}</strong></p>
            </div>
            <p>Best regards,<br><strong>The AutoPilot Geo Team</strong></p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
              <a href="https://autopilotgeo.com" style="color: #7c3aed;">autopilotgeo.com</a>
            </p>
          </body>
          </html>
        `;
        break;

      case "custom":
        subject = data.subject || "Message from AutoPilot Geo";
        html = data.html || `<p>${data.message}</p>`;
        break;

      default:
        throw new Error(`Unknown email type: ${data.type}`);
    }

    // Send email using Resend API directly (fetch)
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [data.to],
        subject,
        html,
        reply_to: "support@autopilotgeo.com",
        ...(Array.isArray(data.attachments) && data.attachments.length > 0
          ? { attachments: data.attachments }
          : {}),
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error("[send-email] Resend API error:", errorData);
      throw new Error(errorData.message || `Resend API error: ${emailResponse.status}`);
    }

    const responseData = await emailResponse.json();
    console.log("[send-email] Sent successfully:", responseData);

    return new Response(JSON.stringify({ success: true, id: responseData.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[send-email] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
