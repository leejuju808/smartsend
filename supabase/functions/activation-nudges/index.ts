// supabase/functions/activation-nudges/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "SmartSend <noreply@smartsendhq.com>";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://smartsendhq.com";

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
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

serve(async () => {
  try {
    // Find users who haven't completed onboarding
    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("onboarding_complete", false)
      .not("email", "is", null);

    if (error) {
      console.error("Error fetching users:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch users", details: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let skipped = 0;

    if (users && users.length > 0) {
      for (const user of users) {
        if (!user.email) {
          skipped++;
          continue;
        }

        // Send activation email to users who haven't completed onboarding
        const html = `
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #2563eb;">⚡ Launch your first campaign today</h1>
    <p>Hi ${user.full_name || 'there'},</p>
    <p>You're one step away from automated outreach. Complete your setup in just 3 quick steps:</p>
    <div style="margin: 30px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/onboarding" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
        Complete Setup →
      </a>
    </div>
    <p style="color: #666; font-size: 14px;">Questions? Just reply to this email — we're here to help!</p>
  </body>
</html>`;

        const success = await sendEmail(
          user.email,
          "⚡ Launch your first campaign today",
          html
        );

        if (success) {
          sent++;
        } else {
          console.error(`Failed to send email to ${user.email}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Activation nudges processed",
        sent,
        skipped,
        total_users: users?.length || 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in activation-nudges:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

