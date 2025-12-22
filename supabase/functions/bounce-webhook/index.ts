// Block 249 — Bounce Monitoring Center v1
// Bounce webhook handler for Postmark, SendGrid, Gmail API, Outlook
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Normalize bounce payloads from different providers
function normalizeBouncePayload(payload: any): {
  email: string | null;
  bounceType: "hard" | "soft";
  reason: string;
  messageId: string | null;
  recipient: string | null;
} {
  // Postmark format
  if (payload.RecordType === "Bounce" || payload.RecordType === "SpamComplaint") {
    const bounceType = payload.Type === "HardBounce" ? "hard" : "soft";
    const reason = payload.Description || payload.Details || payload.MessageStream || "Unknown";
    return {
      email: payload.Email || payload.Recipient,
      bounceType,
      reason,
      messageId: payload.MessageID || null,
      recipient: payload.Recipient || payload.Email,
    };
  }

  // SendGrid format
  if (payload.event === "bounce" || payload.event === "dropped") {
    const bounceType = payload.type === "bounce" && payload.reason === "hard" ? "hard" : "soft";
    const reason = payload.reason || payload.description || "Unknown";
    return {
      email: payload.email,
      bounceType,
      reason,
      messageId: payload.sg_message_id || payload.message_id || null,
      recipient: payload.email,
    };
  }

  // Gmail API / Outlook format (DSN)
  if (payload.dsn || payload.diagnosticCode) {
    const smtpCode = payload.dsn?.status || payload.status || "";
    const bounceType = smtpCode.startsWith("5") ? "hard" : "soft";
    const reason = payload.diagnosticCode || payload.dsn?.diagnosticCode || payload.reason || "Unknown";
    return {
      email: payload.recipient || payload.to || payload.email,
      bounceType,
      reason,
      messageId: payload.messageId || payload.message_id || null,
      recipient: payload.recipient || payload.to || payload.email,
    };
  }

  // Generic format
  const bounceType = payload.bounce_type || (payload.smtp_code?.startsWith("5") ? "hard" : "soft");
  const reason = payload.reason || payload.diagnostic || payload.error || "Unknown";
  return {
    email: payload.email || payload.recipient || payload.to,
    bounceType: bounceType === "hard" ? "hard" : "soft",
    reason,
    messageId: payload.messageId || payload.message_id || payload.MessageID || null,
    recipient: payload.recipient || payload.to || payload.email,
  };
}

// Lookup workspace_id from email
async function lookupWorkspace(email: string | null): Promise<string | null> {
  if (!email) return null;
  
  const { data } = await supabase.rpc("lookup_workspace_from_email", {
    p_email: email,
  });
  return data || null;
}

// Lookup lead_id from email
async function lookupLead(email: string | null): Promise<string | null> {
  if (!email) return null;
  
  const { data } = await supabase.rpc("lookup_lead_from_email", {
    p_email: email,
  });
  return data || null;
}

// Lookup campaign_id from message_id
async function lookupCampaign(messageId: string | null): Promise<string | null> {
  if (!messageId) return null;
  
  const { data } = await supabase.rpc("lookup_campaign_from_message_id", {
    p_message_id: messageId,
  });
  return data || null;
}

// Lookup mailbox_id from recipient email
async function lookupMailbox(recipient: string | null): Promise<string | null> {
  if (!recipient) return null;
  
  const { data } = await supabase.rpc("lookup_mailbox_from_recipient", {
    p_recipient_email: recipient,
  });
  return data || null;
}

Deno.serve(async (req) => {
  try {
    // Optional: Validate webhook secret
    const secret = Deno.env.get("BOUNCE_WEBHOOK_SECRET");
    if (secret && req.headers.get("x-webhook-secret") !== secret) {
      return new Response("Forbidden", { status: 403 });
    }

    const evt = await req.json();
    const normalized = normalizeBouncePayload(evt);

    if (!normalized.email) {
      return new Response(
        JSON.stringify({ error: "Missing email address" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Lookup related entities
    const [workspaceId, leadId, campaignId, mailboxId] = await Promise.all([
      lookupWorkspace(normalized.email),
      lookupLead(normalized.email),
      lookupCampaign(normalized.messageId),
      lookupMailbox(normalized.recipient),
    ]);

    // Insert bounce record
    const { error: insertError } = await supabase.from("bounces").insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      campaign_id: campaignId,
      mailbox_id: mailboxId,
      email: normalized.email.toLowerCase(),
      bounce_type: normalized.bounceType,
      reason: normalized.reason,
      raw: evt,
    });

    if (insertError) {
      console.error("Error inserting bounce:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update mailbox bounce counter (if mailbox_id is available)
    if (mailboxId) {
      await supabase.rpc("increment_bounce", { p_mailbox_id: mailboxId });
    }

    return new Response(
      JSON.stringify({ ok: true, bounce_type: normalized.bounceType }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Bounce webhook error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
