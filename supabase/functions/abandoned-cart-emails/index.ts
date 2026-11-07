import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const FROM_EMAIL = "AutoPilot Geo <support@autopilotgeo.com>";
const APP_URL = "https://autopilotgeo.com";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ABANDONED-CART-EMAILS] ${step}${detailsStr}`);
};

// Get or create a Stripe promo code
async function getOrCreateCoupon(stripe: Stripe, name: string, percentOff: number): Promise<string> {
  try {
    const coupons = await stripe.coupons.list({ limit: 100 });
    const existing = coupons.data.find((c: Stripe.Coupon) =>
      c.name === name && c.percent_off === percentOff && c.duration === "once"
    );

    if (existing) {
      logStep(`Found existing ${name} coupon`, { id: existing.id });
      return existing.id;
    }

    const newCoupon = await stripe.coupons.create({
      name,
      percent_off: percentOff,
      duration: "once",
      max_redemptions: 5000,
    });

    logStep(`Created ${name} coupon`, { id: newCoupon.id });
    return newCoupon.id;
  } catch (error) {
    logStep("Coupon error", { name, error: String(error) });
    return "";
  }
}

async function sendEmail(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
      reply_to: "support@autopilotgeo.com",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `Resend API error: ${response.status}`);
  }

  return response.json();
}

// ─── EMAIL 1: 1 hour — Simple reminder ───
function getEmail1Hour(name?: string, brandName?: string): { subject: string; html: string } {
  return {
    subject: "You were so close! Complete your setup 🚀",
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #7c3aed; margin: 0;">Hey${name ? ` ${name}` : ""}! 👋</h1>
        </div>
        
        <p>You started setting up AutoPilot Geo${brandName ? ` for <strong>${brandName}</strong>` : ""} — you were just one step away from boosting your AI search visibility!</p>
        
        <p style="font-weight: 600;">Here's what you're missing out on:</p>
        <ul>
          <li>🎯 Rank #1 on ChatGPT, Gemini & Perplexity</li>
          <li>📝 30 SEO articles auto-published monthly</li>
          <li>🔗 Auto-posting to WordPress, Shopify & more</li>
          <li>📊 Full SEO audit + keyword research</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/checkout" style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 14px 35px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Complete My Subscription →</a>
        </div>
        
        <p>Questions? Just reply to this email.</p>
        
        <p>Best,<br><strong>The AutoPilot Geo Team</strong></p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="${APP_URL}" style="color: #7c3aed;">autopilotgeo.com</a>
        </p>
      </body>
      </html>
    `,
  };
}

// ─── EMAIL 2: 24 hours — 20% discount ───
function getEmail24Hours(name?: string, couponCode: string = "SAVE20"): { subject: string; html: string } {
  return {
    subject: "🎁 20% off — just for you!",
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #7c3aed; font-size: 26px;">Still thinking about it? 🤔</h1>
        </div>
        
        <p>Hey${name ? ` ${name}` : ""}!</p>
        
        <p>We noticed you haven't completed your subscription yet. To make the decision easier, here's a little something:</p>
        
        <div style="background: linear-gradient(135deg, #7c3aed10, #a855f720); padding: 25px; border-radius: 12px; text-align: center; margin: 25px 0; border: 2px dashed #7c3aed;">
          <p style="margin: 0 0 8px; font-size: 14px; color: #666;">Your exclusive code:</p>
          <p style="margin: 0; font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 2px;">${couponCode}</p>
          <p style="margin: 10px 0 0; font-size: 18px; color: #333;">20% off your first month</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/checkout" style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 14px 35px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Claim My 20% Discount →</a>
        </div>
        
        <p style="font-size: 14px; color: #666;">This code is valid for <strong>48 hours</strong>.</p>
        
        <p>See you inside! 🚀<br><strong>The AutoPilot Geo Team</strong></p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="${APP_URL}" style="color: #7c3aed;">autopilotgeo.com</a>
        </p>
      </body>
      </html>
    `,
  };
}

// ─── EMAIL 3: 72 hours — 1 FREE month (50% off) ───
function getEmail72Hours(name?: string, couponCode: string = "WELCOME50"): { subject: string; html: string } {
  return {
    subject: "⚡ Last chance: 50% off your first month!",
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #dc2626; font-size: 28px;">⚡ Final Offer — Don't Miss This!</h1>
        </div>
        
        <p>Hey${name ? ` ${name}` : ""}!</p>
        
        <p>This is our <strong>last reminder</strong> and our <strong>best offer</strong>. After this, we won't bother you again.</p>
        
        <div style="background: linear-gradient(135deg, #dc262610, #ef444420); padding: 30px; border-radius: 12px; text-align: center; margin: 25px 0; border: 2px solid #dc2626;">
          <p style="margin: 0 0 5px; font-size: 14px; color: #666;">🔥 EXCLUSIVE LAST-CHANCE CODE 🔥</p>
          <p style="margin: 0; font-size: 36px; font-weight: bold; color: #dc2626; letter-spacing: 3px;">${couponCode}</p>
          <p style="margin: 12px 0 0; font-size: 20px; color: #333; font-weight: 600;">50% OFF your first month!</p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #666;">That's just <strong>$14.50/month</strong> instead of $29</p>
        </div>
        
        <p>With AutoPilot Geo you get:</p>
        <ul>
          <li>🏆 Rank #1 on AI search engines (ChatGPT, Gemini, Perplexity)</li>
          <li>📝 30 SEO-optimized articles published automatically every month</li>
          <li>🌍 20+ languages supported</li>
          <li>🔌 Auto-publishing to WordPress, Shopify, Webflow</li>
          <li>📊 Full technical SEO audit</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/checkout" style="background: linear-gradient(135deg, #dc2626, #ef4444); color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 18px; display: inline-block;">🎁 Get 50% OFF Now →</a>
        </div>
        
        <p style="font-size: 14px; color: #dc2626; font-weight: 600; text-align: center;">⏰ Expires in 24 hours — this is our final offer.</p>
        
        <p>Don't miss out!<br><strong>The AutoPilot Geo Team</strong></p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="${APP_URL}" style="color: #7c3aed;">autopilotgeo.com</a>
        </p>
      </body>
      </html>
    `,
  };
}

serve(async (req) => {
  try {
    logStep("Function started — 3-step abandoned cart recovery");

    const now = new Date();
    let emailsSent = 0;

    // ─── STEP 1: 1-hour reminder (window: 1h — 2h ago) ───
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    logStep("Step 1: Checking for 1-hour abandoned carts");

    const { data: step1Sessions, error: step1Error } = await supabaseAdmin
      .from("onboarding_sessions")
      .select("*")
      .not("checkout_started_at", "is", null)
      .is("converted_at", null)
      .eq("abandoned_email_sent", false)
      .not("email", "is", null)
      .lt("checkout_started_at", oneHourAgo.toISOString())
      .gt("checkout_started_at", twoHoursAgo.toISOString());

    if (step1Error) {
      logStep("Step 1 error", { error: step1Error.message });
    } else {
      logStep(`Step 1: Found ${step1Sessions?.length || 0} sessions`);

      for (const session of step1Sessions || []) {
        try {
          const { subject, html } = getEmail1Hour(session.brand_name, session.brand_name);
          await sendEmail(session.email!, subject, html);

          await supabaseAdmin
            .from("onboarding_sessions")
            .update({
              abandoned_email_sent: true,
              abandoned_email_sent_at: new Date().toISOString(),
            })
            .eq("id", session.id);

          emailsSent++;
          logStep("Step 1 sent", { email: session.email });
        } catch (error) {
          logStep("Step 1 send error", { email: session.email, error: String(error) });
        }
      }
    }

    // ─── STEP 2: 24-hour email with 20% discount (window: 24h — 25h ago) ───
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

    logStep("Step 2: Checking for 24-hour abandoned carts");

    const { data: step2Sessions, error: step2Error } = await supabaseAdmin
      .from("onboarding_sessions")
      .select("*")
      .not("checkout_started_at", "is", null)
      .is("converted_at", null)
      .eq("abandoned_email_sent", true)
      .eq("promo_email_sent", false)
      .not("email", "is", null)
      .lt("checkout_started_at", twentyFourHoursAgo.toISOString())
      .gt("checkout_started_at", twentyFiveHoursAgo.toISOString());

    if (step2Error) {
      logStep("Step 2 error", { error: step2Error.message });
    } else {
      logStep(`Step 2: Found ${step2Sessions?.length || 0} sessions`);

      // Create 20% coupon in Stripe
      let coupon20 = "SAVE20";
      if (STRIPE_SECRET_KEY) {
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" });
        await getOrCreateCoupon(stripe, "SAVE20", 20);
      }

      for (const session of step2Sessions || []) {
        try {
          const { subject, html } = getEmail24Hours(session.brand_name, coupon20);
          await sendEmail(session.email!, subject, html);

          await supabaseAdmin
            .from("onboarding_sessions")
            .update({
              promo_email_sent: true,
              promo_email_sent_at: new Date().toISOString(),
            })
            .eq("id", session.id);

          emailsSent++;
          logStep("Step 2 sent", { email: session.email });
        } catch (error) {
          logStep("Step 2 send error", { email: session.email, error: String(error) });
        }
      }
    }

    // ─── STEP 3: 72-hour email with 50% discount (window: 72h — 73h ago) ───
    const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    const seventyThreeHoursAgo = new Date(now.getTime() - 73 * 60 * 60 * 1000);

    logStep("Step 3: Checking for 72-hour abandoned carts");

    const { data: step3Sessions, error: step3Error } = await supabaseAdmin
      .from("onboarding_sessions")
      .select("*")
      .not("checkout_started_at", "is", null)
      .is("converted_at", null)
      .eq("promo_email_sent", true)
      .eq("final_email_sent", false)
      .not("email", "is", null)
      .lt("checkout_started_at", seventyTwoHoursAgo.toISOString())
      .gt("checkout_started_at", seventyThreeHoursAgo.toISOString());

    if (step3Error) {
      logStep("Step 3 error", { error: step3Error.message });
    } else {
      logStep(`Step 3: Found ${step3Sessions?.length || 0} sessions`);

      // Create 50% coupon in Stripe
      let coupon50 = "WELCOME50";
      if (STRIPE_SECRET_KEY) {
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" });
        await getOrCreateCoupon(stripe, "WELCOME50", 50);
      }

      for (const session of step3Sessions || []) {
        try {
          const { subject, html } = getEmail72Hours(session.brand_name, coupon50);
          await sendEmail(session.email!, subject, html);

          await supabaseAdmin
            .from("onboarding_sessions")
            .update({
              final_email_sent: true,
              final_email_sent_at: new Date().toISOString(),
            })
            .eq("id", session.id);

          emailsSent++;
          logStep("Step 3 sent", { email: session.email });
        } catch (error) {
          logStep("Step 3 send error", { email: session.email, error: String(error) });
        }
      }
    }

    logStep("Function completed", { emailsSent });

    return new Response(JSON.stringify({
      success: true,
      emailsSent,
      timestamp: new Date().toISOString(),
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
