// Billing Reminder Edge Function
// Automated billing reminders for upcoming renewals

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const resendFrom = Deno.env.get("RESEND_FROM") || "AUREV <noreply@aurev.ai>";
const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://app.aurev.ai";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to,
        subject,
        html,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    // Find subscriptions renewing in the next 3 days
    const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString();
    
    const { data: subs, error: subsError } = await supabase
      .from("subscriptions")
      .select(`
        *,
        workspaces (
          id,
          name,
          owner_id
        ),
        profiles:workspaces!owner_id (
          id,
          email,
          full_name
        )
      `)
      .eq("status", "active")
      .lte("current_period_end", threeDaysFromNow)
      .gt("current_period_end", new Date().toISOString()) // Not expired yet
      .limit(100);

    if (subsError) {
      console.error("Error fetching subscriptions:", subsError);
      return new Response(
        JSON.stringify({ ok: false, error: subsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No renewals due", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;

    for (const sub of subs) {
      const workspace = Array.isArray(sub.workspaces) ? sub.workspaces[0] : sub.workspaces;
      const profile = workspace?.profiles || (Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles);
      
      if (!profile?.email) {
        console.warn(`Skipping subscription ${sub.id}: no email found`);
        continue;
      }

      const renewalDate = new Date(sub.current_period_end).toLocaleDateString();
      const planName = sub.plan_id || sub.plan || "your plan";
      
      const subject = "Your AUREV renewal is coming up 🔄";
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Renewal Reminder</h2>
          <p>Hi ${profile.full_name || "there"},</p>
          <p>Your <strong>${planName}</strong> plan renews on <strong>${renewalDate}</strong>.</p>
          <p>If you have any questions or need to make changes, just reply to this email.</p>
          <p style="margin-top: 30px;">
            <a href="${appUrl}/billing" 
               style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Manage Subscription
            </a>
          </p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            — The AUREV Team
          </p>
        </div>
      `;

      const success = await sendEmail(profile.email, subject, html);
      
      if (success) {
        sent++;
        console.log(`Sent renewal reminder to ${profile.email}`);
      } else {
        failed++;
        console.error(`Failed to send reminder to ${profile.email}`);
      }
    }

    // Send Slack/Discord notification
    const slackWebhook = Deno.env.get("SLACK_WEBHOOK_URL");
    if (slackWebhook) {
      try {
        await fetch(slackWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `💰 Billing Reminder: Sent ${sent} renewal reminder(s). ${failed > 0 ? `${failed} failed.` : ""}`,
          }),
        });
      } catch (webhookError) {
        console.error("Error sending Slack notification:", webhookError);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Billing reminders sent",
        sent,
        failed,
        total: subs.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in billing-reminder:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

