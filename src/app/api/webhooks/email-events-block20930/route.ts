// Block 20930 — Email Events Webhook Handler
// Processes bounce/complaint events from email providers

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Normalize event from various providers (Resend, MailerSend, SNS, etc.)
    const event = normalizeEvent(body);
    
    if (!event) {
      return NextResponse.json({ ok: true, message: "Event not processed" });
    }

    // Find email_log by message_id or recipient
    let emailLogId: string | null = null;
    let organizationId: string | null = null;

    if (event.messageId) {
      const { data: emailLog } = await supabase
        .from("email_logs")
        .select("id, org_id, workspace_id")
        .eq("provider_message_id", event.messageId)
        .single();

      if (emailLog) {
        emailLogId = emailLog.id;
        organizationId = emailLog.org_id || emailLog.workspace_id;
      }
    }

    // If not found by messageId, try by recipient
    if (!emailLogId && event.recipient) {
      const { data: emailLog } = await supabase
        .from("email_logs")
        .select("id, org_id, workspace_id")
        .eq("to_address", event.recipient.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (emailLog) {
        emailLogId = emailLog.id;
        organizationId = emailLog.org_id || emailLog.workspace_id;
      }
    }

    if (!organizationId) {
      console.warn("Could not find organization for event:", event);
      return NextResponse.json({ ok: true, message: "Organization not found" });
    }

    // Record event
    await supabase.from("email_events").insert({
      organization_id: organizationId,
      email_id: emailLogId,
      event_type: event.eventType,
      timestamp: new Date().toISOString(),
      extra: {
        provider: event.provider,
        reason: event.reason,
        code: event.code,
        raw_event: body,
      },
    });

    // If bounce/complaint, trigger auto-pause check
    if (event.eventType.includes("bounce") || event.eventType.includes("complaint")) {
      // Find domain from email_log
      if (emailLogId) {
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("from_address")
          .eq("id", emailLogId)
          .single();

        if (emailLog?.from_address) {
          const domain = emailLog.from_address.split("@")[1]?.toLowerCase();
          if (domain) {
            const { data: domainSettings } = await supabase
              .from("domain_settings")
              .select("id")
              .eq("org_id", organizationId)
              .eq("domain", domain)
              .single();

            if (domainSettings) {
              await supabase.rpc("auto_pause_domain_v2", {
                p_domain_settings_id: domainSettings.id,
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Email events webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}

function normalizeEvent(body: any): {
  eventType: string;
  messageId?: string;
  recipient?: string;
  reason?: string;
  code?: string;
  provider: string;
} | null {
  // Resend format
  if (body.type === "email.bounced" || body.type === "email.complained") {
    return {
      eventType: body.type === "email.bounced" ? "bounced" : "complained",
      messageId: body.data?.email_id,
      recipient: body.data?.to?.[0],
      reason: body.data?.bounce?.error || body.data?.complaint?.reason,
      code: body.data?.bounce?.code,
      provider: "resend",
    };
  }

  // AWS SES/SNS format
  if (body.Type === "Notification" && body.Message) {
    const message = JSON.parse(body.Message);
    if (message.notificationType === "Bounce" || message.notificationType === "Complaint") {
      return {
        eventType: message.notificationType === "Bounce" ? "bounced" : "complained",
        messageId: message.mail?.messageId,
        recipient: message.mail?.destination?.[0],
        reason: message.bounce?.bouncedRecipients?.[0]?.diagnosticCode || 
                message.complaint?.complainedRecipients?.[0]?.complaintFeedbackType,
        code: message.bounce?.bounceType,
        provider: "ses",
      };
    }
  }

  // MailerSend format
  if (body.type === "activity.bounce" || body.type === "activity.spam_complaint") {
    return {
      eventType: body.type === "activity.bounce" ? "bounced" : "complained",
      messageId: body.data?.message_id,
      recipient: body.data?.recipient?.email,
      reason: body.data?.reason,
      provider: "mailersend",
    };
  }

  // Generic format
  if (body.event_type || body.eventType) {
    return {
      eventType: body.event_type || body.eventType,
      messageId: body.message_id || body.messageId,
      recipient: body.recipient || body.to || body.email,
      reason: body.reason,
      code: body.code,
      provider: body.provider || "unknown",
    };
  }

  return null;
}
















































