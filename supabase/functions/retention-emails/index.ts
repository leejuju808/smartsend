import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "SmartSend <noreply@smartsend.ai";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://smartsendhq.com";

interface EmailTemplate {
  subject: string;
  html: string;
}

// Email templates
const EMAIL_TEMPLATES = {
  activation: (name: string): EmailTemplate => ({
    subject: "How to send your first campaign in 3 minutes ⚡",
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Welcome to SmartSend, ${name || 'there'}! 🎉</h1>
          <p>Getting your first campaign out is easier than you think. Here's how:</p>
          <ol style="line-height: 2;">
            <li>Import your leads (CSV or connect LinkedIn)</li>
            <li>Pick a template or write your own</li>
            <li>Hit send — we handle the rest</li>
          </ol>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${APP_URL}/dashboard/campaigns/new" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Create Your First Campaign →
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Need help? Reply to this email — we're here to help!</p>
        </body>
      </html>
    `,
  }),
  inactivity: (name: string, lastActive: string): EmailTemplate => ({
    subject: "Your outreach stopped… want SmartSend to finish it?",
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Hi ${name || 'there'},</h1>
          <p>We noticed you haven't logged in since ${lastActive}. Your outreach campaigns might need attention.</p>
          <p>SmartSend can help you:</p>
          <ul style="line-height: 2;">
            <li>✅ Automate follow-ups so nothing falls through</li>
            <li>✅ Track replies and engagement in real-time</li>
            <li>✅ Scale your outreach without the manual work</li>
          </ul>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${APP_URL}/dashboard" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Log Back In →
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Questions? Just reply — we're here to help.</p>
        </body>
      </html>
    `,
  }),
  renewal: (name: string, periodEnd: string, usageStats: any): EmailTemplate => ({
    subject: "Your SmartSend Pro plan renews soon ⚡",
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Hi ${name || 'there'},</h1>
          <p>Your SmartSend Pro subscription renews on <strong>${periodEnd}</strong>.</p>
          <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-weight: 600;">Your usage this period:</p>
            <ul style="margin: 8px 0 0 0; padding-left: 20px;">
              <li>📧 ${usageStats.emails_sent || 0} emails sent</li>
              <li>🚀 ${usageStats.campaigns_created || 0} campaigns created</li>
              <li>💬 ${usageStats.replies_received || 0} replies received</li>
            </ul>
          </div>
          <p>Thanks for being part of SmartSend! Your subscription will automatically renew.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${APP_URL}/dashboard/settings/billing" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Manage Subscription →
            </a>
          </div>
        </body>
      </html>
    `,
  }),
};

async function sendEmail(to: string, template: EmailTemplate): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to,
        subject: template.subject,
        html: template.html,
        text: template.html.replace(/<[^>]*>/g, ""),
      }),
    });

    return response.ok;
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    return false;
  }
}

serve(async (req) => {
  try {
    const { type } = await req.json();

    if (!type || !["activation", "inactivity", "renewal"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid type. Must be: activation, inactivity, or renewal" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;

    if (type === "activation") {
      // Send to users who signed up 2 days ago and haven't created a campaign
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const { data: users } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .gte("created_at", twoDaysAgo.toISOString())
        .lt("created_at", new Date(twoDaysAgo.getTime() + 24 * 60 * 60 * 1000).toISOString())
        .not("email", "is", null);

      if (users) {
        for (const user of users) {
          // Check if they've created a campaign
          const { count } = await supabase
            .from("campaigns")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .limit(1);

          if (count === 0 && user.email) {
            const template = EMAIL_TEMPLATES.activation(user.full_name || "there");
            const success = await sendEmail(user.email, template);
            if (success) sent++;
            else failed++;
          }
        }
      }
    } else if (type === "inactivity") {
      // Send to users who haven't logged in for 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: users } = await supabase
        .from("profiles")
        .select("id, email, full_name, updated_at")
        .lt("updated_at", sevenDaysAgo.toISOString())
        .not("email", "is", null);

      if (users) {
        for (const user of users) {
          if (user.email) {
            const lastActive = new Date(user.updated_at).toLocaleDateString();
            const template = EMAIL_TEMPLATES.inactivity(user.full_name || "there", lastActive);
            const success = await sendEmail(user.email, template);
            if (success) sent++;
            else failed++;
          }
        }
      }
    } else if (type === "renewal") {
      // Send to users whose subscription renews in 3 days
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      const threeDaysFromNowEnd = new Date(threeDaysFromNow);
      threeDaysFromNowEnd.setHours(23, 59, 59, 999);

      // Get subscriptions renewing in 3 days
      const { data: subs } = await supabase
        .from("billing_subscriptions")
        .select("user_id, current_period_end")
        .eq("status", "active")
        .gte("current_period_end", threeDaysFromNow.toISOString())
        .lte("current_period_end", threeDaysFromNowEnd.toISOString());

      if (subs) {
        for (const sub of subs) {
          // Get user profile and usage stats
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", sub.user_id)
            .maybeSingle();

          if (profile?.email) {
            // Get usage stats
            const { data: usage } = await supabase
              .from("v_user_usage_summary")
              .select("emails_sent, campaigns_created, replies_received")
              .eq("user_id", sub.user_id)
              .maybeSingle();

            const periodEnd = new Date(sub.current_period_end).toLocaleDateString();
            const template = EMAIL_TEMPLATES.renewal(
              profile.full_name || "there",
              periodEnd,
              usage || {}
            );
            const success = await sendEmail(profile.email, template);
            if (success) sent++;
            else failed++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        failed,
        type,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in retention-emails:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

