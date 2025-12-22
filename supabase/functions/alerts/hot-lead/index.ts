// supabase/functions/alerts/hot-lead/index.ts
// Block 11800 — SmartSend Roofing Hot Lead Alerts v1
// The Instant Notification System That Makes Roofers Jump on Money FAST

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "SmartSend <alerts@smartsend.ai>";
const APP_URL = Deno.env.get("APP_URL") || "https://app.smartsend.ai";

interface HotLeadAlertRequest {
  user_id: string;
  workspace_id: string;
  lead_id: string;
  inbound_message_id?: string;
  reply_snippet?: string;
  lead_name?: string;
  lead_email?: string;
}

/**
 * Sends email notification for hot lead
 */
async function sendEmailAlert(params: {
  userEmail: string;
  leadName: string;
  replySnippet: string;
  leadId: string;
}): Promise<void> {
  if (!RESEND_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return;
  }

  const subject = `🔥 HOT Lead Detected — ${params.leadName} Wants Estimate`;
  const leadUrl = `${APP_URL}/leads/${params.leadId}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #FFD700; padding: 20px; text-align: center; }
        .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
        .hot-badge { display: inline-block; padding: 4px 12px; background: #FF4444; color: #fff; border-radius: 4px; font-weight: bold; font-size: 12px; }
        .button { display: inline-block; padding: 12px 24px; background: #FFD700; color: #000; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 20px; }
        .reply-box { background: #f5f5f5; padding: 15px; border-left: 4px solid #FFD700; margin: 20px 0; font-style: italic; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔥 SmartSend Hot Lead Alert</h1>
        </div>
        <div class="content">
          <p><span class="hot-badge">HOT LEAD</span></p>
          <h2>New hot roofing lead from ${params.leadName}</h2>
          
          <div class="reply-box">
            <strong>Reply:</strong><br>
            "${params.replySnippet}"
          </div>
          
          <p>SmartSend paused follow-ups automatically.</p>
          
          <a href="${leadUrl}" class="button">View Lead Thread</a>
        </div>
        <div class="footer">
          <p>You're receiving this because a homeowner replied with high intent.</p>
          <p><a href="${APP_URL}/settings/notifications">Manage Preferences</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: params.userEmail,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }
}

/**
 * Creates in-app notification (banner)
 */
async function createInAppNotification(params: {
  workspaceId: string;
  userId: string;
  leadId: string;
  leadName: string;
  replySnippet: string;
}): Promise<void> {
  const leadUrl = `/leads/${params.leadId}`;
  const title = `🔥 New HOT Lead: ${params.leadName}`;
  const body = `"${params.replySnippet}"`;

  // Use the notifications table (v2 schema)
  await supabase.from("notifications").insert({
    workspace_id: params.workspaceId,
    user_id: params.userId,
    category: "lead",
    type: "hot_lead",
    title,
    body,
    url: leadUrl,
    entity_type: "contact",
    entity_id: params.leadId,
    read: false,
    is_read: false,
  });
}

/**
 * Pauses follow-ups for the lead
 */
async function pauseFollowups(params: {
  workspaceId: string;
  leadId: string;
  campaignId?: string;
}): Promise<void> {
  // Try to find campaign_id if not provided
  let campaignId = params.campaignId;
  
  if (!campaignId) {
    const { data: campaignLead } = await supabase
      .from("campaign_leads")
      .select("campaign_id")
      .eq("lead_id", params.leadId)
      .limit(1)
      .maybeSingle();
    
    campaignId = campaignLead?.campaign_id ?? null;
  }

  if (campaignId) {
    // Use safe_pause_followups function if available
    const { error } = await supabase.rpc("safe_pause_followups", {
      p_campaign_id: campaignId,
      p_lead_id: params.leadId,
      p_reason: "hot_lead_detected",
    });

    if (error) {
      console.error("Failed to pause follow-ups:", error);
      // Continue anyway - don't fail the alert
    }
  }
}

/**
 * Logs timeline event
 */
async function logTimelineEvent(params: {
  workspaceId: string;
  leadId: string;
  userId: string;
}): Promise<void> {
  // Try to log to activity_logs or activity_events
  const activityData = {
    workspace_id: params.workspaceId,
    user_id: params.userId,
    lead_id: params.leadId,
    type: "hot_lead_detected",
    title: "HOT lead detected — follow-ups paused",
    metadata: {
      source: "block_11800_hot_lead_alerts",
    },
  };

  // Try activity_logs first
  await supabase
    .from("activity_logs")
    .insert(activityData)
    .catch(() => {
      // If that fails, try activity_events
      return supabase.from("activity_events").insert({
        org_id: params.workspaceId,
        user_id: params.userId,
        contact_id: params.leadId,
        type: "hot_lead_detected",
        title: "HOT lead detected — follow-ups paused",
        metadata: activityData.metadata,
      });
    })
    .catch((err) => {
      console.error("Failed to log timeline event:", err);
      // Don't fail the alert if logging fails
    });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body: HotLeadAlertRequest = await req.json();

    // Validate required fields
    if (!body.user_id || !body.workspace_id || !body.lead_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: user_id, workspace_id, lead_id",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check cooldown using database function
    const { data: shouldSuppress } = await supabase.rpc(
      "should_suppress_hot_lead_alert",
      {
        p_user_id: body.user_id,
        p_lead_id: body.lead_id,
      }
    );

    if (shouldSuppress) {
      return new Response(
        JSON.stringify({
          ok: true,
          suppressed: true,
          reason: "Cooldown: Alert already sent for this lead in the last hour",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get lead details if not provided
    let leadName = body.lead_name;
    let leadEmail = body.lead_email;
    let replySnippet = body.reply_snippet || "";

    if (!leadName || !leadEmail) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id, name, email, first_name, last_name")
        .eq("id", body.lead_id)
        .single();

      if (lead) {
        leadName =
          leadName ||
          lead.name ||
          [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
          lead.email ||
          "Unknown";
        leadEmail = leadEmail || lead.email || "";
      }
    }

    // Get reply snippet from inbound message if not provided
    if (!replySnippet && body.inbound_message_id) {
      const { data: inbound } = await supabase
        .from("inbound_messages")
        .select("text_body, html_body, subject")
        .eq("id", body.inbound_message_id)
        .single();

      if (inbound) {
        replySnippet =
          inbound.text_body?.slice(0, 200) ||
          (inbound.html_body
            ? inbound.html_body.replace(/<[^>]*>/g, " ").slice(0, 200)
            : "") ||
          inbound.subject ||
          "Hot lead reply";
      }
    }

    replySnippet = replySnippet || "Hot lead detected";

    // Create alert record (this also checks cooldown)
    const { data: alertId, error: alertError } = await supabase.rpc(
      "create_hot_lead_alert",
      {
        p_user_id: body.user_id,
        p_workspace_id: body.workspace_id,
        p_lead_id: body.lead_id,
        p_inbound_message_id: body.inbound_message_id || null,
        p_reply_snippet: replySnippet,
        p_lead_name: leadName,
        p_lead_email: leadEmail,
      }
    );

    if (alertError || !alertId) {
      // If alert was suppressed (cooldown), return success
      if (alertError?.message?.includes("suppress") || !alertId) {
        return new Response(
          JSON.stringify({
            ok: true,
            suppressed: true,
            reason: "Cooldown: Alert already sent for this lead in the last hour",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      console.error("Failed to create alert record:", alertError);
      return new Response(
        JSON.stringify({ error: "Failed to create alert record" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Create in-app notification (always)
    await createInAppNotification({
      workspaceId: body.workspace_id,
      userId: body.user_id,
      leadId: body.lead_id,
      leadName: leadName || "Unknown",
      replySnippet: replySnippet.slice(0, 200),
    });

    // 2. Send email notification
    let emailSent = false;
    try {
      const { data: user } = await supabase.auth.admin.getUserById(
        body.user_id
      );
      const userEmail = user?.user?.email;

      if (userEmail) {
        await sendEmailAlert({
          userEmail,
          leadName: leadName || "Unknown",
          replySnippet: replySnippet.slice(0, 200),
          leadId: body.lead_id,
        });
        emailSent = true;

        // Update alert record to mark email as sent
        await supabase.rpc("update_hot_lead_alert_channels", {
          p_alert_id: alertId,
          p_sent_via_email: true,
        });
      }
    } catch (emailError) {
      console.error("Failed to send email alert:", emailError);
      // Continue - don't fail the whole alert
    }

    // 3. Pause follow-ups
    await pauseFollowups({
      workspaceId: body.workspace_id,
      leadId: body.lead_id,
    });

    // 4. Log timeline event
    await logTimelineEvent({
      workspaceId: body.workspace_id,
      leadId: body.lead_id,
      userId: body.user_id,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        alert_id: alertId,
        channels_sent: {
          in_app: true,
          email: emailSent,
          sms: false, // v2 feature
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Hot lead alert error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































