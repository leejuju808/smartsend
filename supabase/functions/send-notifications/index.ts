import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "SmartSend <no-reply@smartsend.ai>";
const APP_URL = Deno.env.get("APP_URL") || "https://app.smartsend.ai";

// Throttle rules per event type (in minutes)
const THROTTLE_RULES: Record<string, number> = {
  reply_high_intent: 5,
  reply_general: 15,
  enrichment_finished: 0, // Batch per import (no throttle)
  campaign_blocked: 0, // No throttle
  send_plan_overutilization: 60,
  mailbox_bounce_rise: 720, // 12 hours
  digest_daily: 1440, // 24 hours
  digest_weekly: 10080, // 7 days
};

interface NotificationEvent {
  workspace_id: string;
  user_id: string;
  event: string;
  title: string;
  message?: string;
  data?: Record<string, any>;
}

async function shouldThrottle(userId: string, event: string): Promise<boolean> {
  const throttleMinutes = THROTTLE_RULES[event];
  if (!throttleMinutes || throttleMinutes === 0) {
    return false; // No throttling for this event
  }

  const { data: throttle } = await supabase
    .from("notification_throttle")
    .select("last_sent")
    .eq("user_id", userId)
    .eq("event", event)
    .single();

  if (!throttle) {
    return false; // No previous notification, allow
  }

  const lastSent = new Date(throttle.last_sent);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSent.getTime()) / (1000 * 60);

  return diffMinutes < throttleMinutes;
}

async function updateThrottle(userId: string, event: string): Promise<void> {
  await supabase.rpc("update_notification_throttle", {
    p_user_id: userId,
    p_event: event,
  });
}

async function getUserPreferences(userId: string, event: string): Promise<string[]> {
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("channel")
    .eq("user_id", userId)
    .eq("event", event);

  if (!prefs || prefs.length === 0) {
    // Return defaults based on event type
    if (event === "reply_high_intent") return ["email", "in_app"];
    if (event === "reply_general") return ["in_app"];
    if (event === "campaign_blocked") return ["email", "in_app"];
    if (event === "enrichment_finished") return ["in_app"];
    if (event === "digest_daily" || event === "digest_weekly") return ["email"];
    if (event === "deal_opened") return ["in_app"];
    if (event === "mailbox_health_issue") return ["email"];
    return ["in_app"]; // Default fallback
  }

  // Return all channels for this event (can be multiple)
  const channels = prefs.map((p) => p.channel).filter((c) => c !== "none");
  return channels.length > 0 ? channels : ["none"];
}

async function getUserEmail(userId: string): Promise<string | null> {
  const { data: user } = await supabase.auth.admin.getUserById(userId);
  return user?.user?.email || null;
}

async function sendEmailNotification(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (!RESEND_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }
}

async function createInAppNotification(event: NotificationEvent): Promise<void> {
  await supabase.from("notifications").insert({
    workspace_id: event.workspace_id,
    user_id: event.user_id,
    type: event.event,
    title: event.title,
    message: event.message,
    data: event.data || {},
    read: false,
  });
}

Deno.serve(async (req) => {
  try {
    const event: NotificationEvent = await req.json();

    // Validate required fields
    if (!event.workspace_id || !event.user_id || !event.event || !event.title) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: workspace_id, user_id, event, title",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get user preferences
    const channels = await getUserPreferences(event.user_id, event.event);

    // Check throttling
    const throttled = await shouldThrottle(event.user_id, event.event);

    // Determine what to send
    const shouldSendEmail = channels.includes("email") && !throttled;
    const shouldSendInApp = channels.includes("in_app") || throttled; // Always send in-app if throttled

    // Create in-app notification
    if (shouldSendInApp || channels.includes("in_app")) {
      await createInAppNotification(event);
    }

    // Send email if needed
    if (shouldSendEmail) {
      const userEmail = await getUserEmail(event.user_id);
      if (userEmail) {
        // Generate email HTML based on event type
        const emailHtml = generateEmailHtml(event);
        await sendEmailNotification(userEmail, event.title, emailHtml);
      }
    }

    // Update throttle timestamp
    if (!throttled) {
      await updateThrottle(event.user_id, event.event);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        channels_sent: {
          email: shouldSendEmail,
          in_app: shouldSendInApp,
        },
        throttled,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Send notifications error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function generateEmailHtml(event: NotificationEvent): string {
  const { event: eventType, title, message, data } = event;

  // Base template
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #FFD700; padding: 20px; text-align: center; }
        .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
        .button { display: inline-block; padding: 12px 24px; background: #FFD700; color: #000; text-decoration: none; border-radius: 4px; font-weight: bold; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚡ SmartSend</h1>
        </div>
        <div class="content">
          <h2>${title}</h2>
  `;

  // Event-specific content
  if (eventType === "reply_high_intent") {
    const leadName = data?.lead?.first_name || data?.lead?.email || "A lead";
    const meetingTime = data?.meeting_time;
    html += `
      <p><strong>${leadName}</strong> replied with high intent!</p>
      ${meetingTime ? `<p>📅 Meeting time detected: <strong>${meetingTime}</strong></p>` : ""}
      ${message ? `<p>${message}</p>` : ""}
      ${data?.thread_id ? `<p><a href="${APP_URL}/replies/${data.thread_id}" class="button">View Thread</a></p>` : ""}
    `;
  } else if (eventType === "campaign_blocked") {
    const campaignName = data?.campaign?.name || "A campaign";
    html += `
      <p>Campaign <strong>"${campaignName}"</strong> cannot launch.</p>
      ${message ? `<p>${message}</p>` : ""}
      ${data?.campaign_id ? `<p><a href="${APP_URL}/campaigns/${data.campaign_id}" class="button">View Campaign</a></p>` : ""}
    `;
  } else if (eventType === "mailbox_health_issue") {
    const mailboxEmail = data?.mailbox?.email || "your mailbox";
    html += `
      <p>⚠️ Bounce rate is rising on <strong>${mailboxEmail}</strong>.</p>
      ${message ? `<p>${message}</p>` : ""}
      <p><a href="${APP_URL}/settings/mailboxes" class="button">Check Mailbox Health</a></p>
    `;
  } else {
    // Generic template
    html += message ? `<p>${message}</p>` : "";
  }

  html += `
        </div>
        <div class="footer">
          <p>You're receiving this because of your notification preferences.</p>
          <p><a href="${APP_URL}/settings/notifications">Manage Preferences</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

