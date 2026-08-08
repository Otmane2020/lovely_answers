import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "AutoPilot Geo <support@autopilotgeo.com>";
const ADMIN_EMAIL = "support@autopilotgeo.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, any>;
  old_record?: Record<string, any>;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: WebhookPayload = await req.json();
    console.log("[db-email-trigger] Received:", payload.type, payload.table);

    // Handle new profile creation (welcome email + AI automation)
    if (payload.table === "profiles" && payload.type === "INSERT") {
      const profile = payload.record;
      if (profile.email) {
        console.log("[db-email-trigger] Sending welcome email to:", profile.email);

        await sendEmail({
          to: profile.email,
          subject: "Welcome to AutoPilot Geo! 🎉",
          html: generateWelcomeEmail(profile.full_name || profile.email.split("@")[0]),
        });

        // Trigger AI welcome call + WhatsApp (fire & forget)
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        fetch(`${supabaseUrl}/functions/v1/welcome-automation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ record: profile }),
        }).catch((err) => console.error("[db-email-trigger] welcome-automation error:", err));
      }
    }

    // Handle new support ticket (notify admin)
    if (payload.table === "support_tickets" && payload.type === "INSERT") {
      const ticket = payload.record;
      console.log("[db-email-trigger] New ticket, notifying admin");
      
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `🎫 New ticket: ${ticket.subject}`,
        html: generateAdminTicketNotification(ticket),
      });
    }

    // Handle new support message from admin (notify user)
    if (payload.table === "support_messages" && payload.type === "INSERT") {
      const message = payload.record;
      
      if (message.sender_type === "admin" || message.sender_type === "support") {
        // Get ticket details
        const { data: ticket } = await supabase
          .from("support_tickets")
          .select("id, subject, user_email, user_id")
          .eq("id", message.ticket_id)
          .single();

        if (ticket && ticket.user_email) {
          // Get user name
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", ticket.user_id)
            .single();

          console.log("[db-email-trigger] Admin replied, notifying user:", ticket.user_email);
          
          await sendEmail({
            to: ticket.user_email,
            subject: `Reply to your ticket: ${ticket.subject}`,
            html: generateTicketReplyEmail(
              profile?.full_name || ticket.user_email.split("@")[0],
              ticket.subject,
              message.message
            ),
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[db-email-trigger] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

async function sendEmail(options: { to: string; subject: string; html: string }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      reply_to: "support@autopilotgeo.com",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("[db-email-trigger] Resend error:", error);
    throw new Error(error.message || "Failed to send email");
  }

  const data = await response.json();
  console.log("[db-email-trigger] Email sent:", data.id);
  return data;
}

function generateWelcomeEmail(name: string): string {
  return `
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

      <p>Hi ${name},</p>

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
}

function generateAdminTicketNotification(ticket: Record<string, any>): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #7c3aed;">🎫 New Support Ticket</h2>

      <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0;">
        <p style="margin: 0;"><strong>From:</strong> ${ticket.user_email}</p>
        <p style="margin: 10px 0 0;"><strong>Subject:</strong> ${ticket.subject}</p>
      </div>

      <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; white-space: pre-wrap;">${ticket.message}</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://app.autopilotgeo.com/super-admin" style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reply to ticket</a>
      </div>

      <p style="font-size: 12px; color: #888;">Ticket ID: ${ticket.id}</p>
    </body>
    </html>
  `;
}

function generateTicketReplyEmail(name: string, subject: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #7c3aed;">New reply to your ticket 💬</h2>

      <p>Hi ${name},</p>

      <p>Our support team has replied to your request "<strong>${subject}</strong>":</p>

      <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #22c55e; margin: 20px 0;">
        <p style="margin: 0; white-space: pre-wrap;">${message}</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://autopilotgeo.com/support" style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">View conversation</a>
      </div>

      <p>Best regards,<br><strong>The AutoPilot Geo Support Team</strong></p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="font-size: 12px; color: #888; text-align: center;">
        Reply directly to this email to continue the conversation.
      </p>
    </body>
    </html>
  `;
}
