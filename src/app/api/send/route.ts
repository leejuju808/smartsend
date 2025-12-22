import { NextRequest, NextResponse } from "next/server";

function base64UrlEncode(str: string) {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildRfc822({
  from,
  to,
  subject,
  text,
  messageIdDomain = "smartsendhq.com",
  inReplyTo,
  references,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageIdDomain?: string;
  inReplyTo?: string;
  references?: string;
}) {
  // Generate stable Message-Id
  const uuid = crypto.randomUUID();
  const messageId = `<${uuid}@${messageIdDomain}>`;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-Id: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references ? [`References: ${references}`] : []),
  ].join("\r\n");

  const raw = `${headers}\r\n\r\n${text}`;
  return { messageId, raw };
}

async function sendViaGmail(accessToken: string, raw: string) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64UrlEncode(raw) }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Gmail send failed: ${r.status} ${r.statusText}`);
  return (await r.json()) as { id: string; threadId: string };
}

async function insertRows({
  supaUrl,
  anon,
  service,
  sentPayload,
  outboxPayload,
}: {
  supaUrl: string;
  anon: string;
  service: string;
  sentPayload: any;
  outboxPayload: any;
}) {
  const headers = {
    apikey: anon,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  // sent_messages
  const sentRes = await fetch(`${supaUrl}/rest/v1/sent_messages`, {
    method: "POST",
    headers,
    body: JSON.stringify([sentPayload]),
  });
  if (!sentRes.ok) {
    const error = await sentRes.text();
    // Ignore unique constraint violations (idempotent retry)
    if (!error.includes("duplicate key value violates unique constraint")) {
      throw new Error(`Failed to insert sent_messages: ${error}`);
    }
  }

  // email_messages (outbound mirror)
  const outboxRes = await fetch(`${supaUrl}/rest/v1/email_messages`, {
    method: "POST",
    headers,
    body: JSON.stringify([outboxPayload]),
  });
  if (!outboxRes.ok) {
    const error = await outboxRes.text();
    // Ignore unique constraint violations (idempotent retry)
    if (!error.includes("duplicate key value violates unique constraint")) {
      throw new Error(`Failed to insert email_messages: ${error}`);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      leadId,
      campaignId,
      fromEmail,
      toEmail,
      subject,
      text,
      inReplyTo,   // optional for follow-ups
      references,  // optional
    } = await req.json();

    if (!leadId || !fromEmail || !toEmail || !subject || !text) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const SENDER_DOMAIN = process.env.SMARTSEND_MESSAGE_ID_DOMAIN || "smartsendhq.com";

    // Block 287: Check billing caps before sending
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    
    const { data: lead } = await supabase
      .from("leads")
      .select("workspace_id, org_id, owner_id, user_id")
      .eq("id", leadId)
      .single();

    // BLOCK 100000: Subscription System + Billing Enforcement + Usage Limits
    // Get user_id from lead (owner_id or user_id)
    const userId = lead?.owner_id || lead?.user_id;
    if (userId) {
      const { checkEmailLimit } = await import("@/lib/billing/block100000-enforcement");
      const limitCheck = await checkEmailLimit(userId);

      if (!limitCheck.canSend) {
        return NextResponse.json(
          {
            error: "Email limit reached. Upgrade required.",
            type: "billing_limit",
            reason: limitCheck.reason,
            remaining: limitCheck.remaining,
          },
          { status: 403 }
        );
      }
    }

    if (lead?.workspace_id) {
      const { data: usage } = await supabase
        .from("billing_usage_daily")
        .select("*")
        .eq("workspace_id", lead.workspace_id)
        .single();

      if (usage) {
        // Hard blocks - return 429 with billing error
        if (usage.seat_over_cap) {
          return NextResponse.json(
            {
              error: "seat_over_cap",
              type: "billing_overage",
            },
            { status: 429 }
          );
        }

        if (usage.send_over_cap) {
          return NextResponse.json(
            {
              error: "daily_send_cap_reached",
              type: "billing_overage",
            },
            { status: 429 }
          );
        }
      }
    }

    // Block 20930: Deliverability Engine v1 - Comprehensive Safeguards
    if (lead?.org_id) {
      const { checkDeliverabilitySafeguards, updateWarmupAfterSend } = await import("@/lib/deliverability/block20930-safeguards");
      
      // Block 20930 safeguard check
      const safeguardCheck = await checkDeliverabilitySafeguards(
        lead.org_id,
        fromEmail,
        toEmail
      );

      if (!safeguardCheck.can_send) {
        return NextResponse.json(
          {
            error: safeguardCheck.reason || "deliverability_check_failed",
            message: safeguardCheck.message || "Sending blocked by deliverability safeguards",
            type: "deliverability_engine",
            domain_settings_id: safeguardCheck.domain_settings_id,
          },
          { status: 403 }
        );
      }

      // Record warmup send if domain is warming up
      if (safeguardCheck.domain_settings_id) {
        await updateWarmupAfterSend(safeguardCheck.domain_settings_id).catch(console.error);
      }
    }

    // 1) Build RFC 822 message with our controlled Message-Id
    const { messageId, raw } = buildRfc822({
      from: fromEmail,
      to: toEmail,
      subject,
      text,
      messageIdDomain: SENDER_DOMAIN,
      inReplyTo,
      references,
    });

    // 2) Prefer Gmail OAuth (gmail_connections)
    let threadId: string | null = null;
    let providerSendId: string | null = null;

    // Load a fresh token (auto-refreshes if needed)
    try {
      const { getFreshGmailToken } = await import("@/lib/getFreshGmailToken");
      const accessToken = await getFreshGmailToken();
      const resp = await sendViaGmail(accessToken, raw);
      providerSendId = resp.id;
      threadId = resp.threadId;
    } catch (gmailError: any) {
      // Fallback to SMTP if Gmail connection fails
      // 3) SMTP fallback via Nodemailer (optional)
      // If you want SMTP, set SMTP_HOST/PORT/USER/PASS. Otherwise throw.
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
      if (!SMTP_HOST) throw new Error("No Gmail connection and SMTP not configured");

      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT ?? 587),
        secure: false,
        auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      });

      const info = await transporter.sendMail({
        envelope: { from: fromEmail, to: toEmail },
        raw, // pass full RFC822
      });
      // Nodemailer returns 'messageId' but threadId is provider-specific (unknown here)
      providerSendId = info.messageId || messageId;
    }

    // 4) Persist
    const sentPayload = {
      lead_id: leadId,
      campaign_id: campaignId ?? null,
      provider_message_id: messageId, // <-- store OUR Message-Id header for reply matching
      thread_id: threadId,
      subject,
      to_email: toEmail,
      sent_at: new Date().toISOString(),
    };

    const outboxPayload = {
      thread_id: threadId,
      provider_message_id: providerSendId, // provider's ID for diagnostics
      in_reply_to: inReplyTo || null,
      references_header: references || null,
      subject,
      from_email: fromEmail,
      to_email: toEmail,
      sent_at: new Date().toISOString(),
      body_plain: text,
      is_inbound: false,
      lead_id: leadId,
      campaign_id: campaignId ?? null,
    };

    await insertRows({
      supaUrl: SUPABASE_URL,
      anon: SUPABASE_ANON,
      service: SUPABASE_SERVICE,
      sentPayload,
      outboxPayload,
    });

    // BLOCK 100000: Increment email usage after successful send
    if (userId) {
      const { incrementEmailUsage } = await import("@/lib/billing/block100000-enforcement");
      await incrementEmailUsage(userId).catch((err) => {
        console.error("Failed to increment email usage:", err);
        // Don't fail the request if usage tracking fails
      });
    }

    return NextResponse.json({ ok: true, messageId, threadId, providerSendId });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Send failed" }, { status: 500 });
  }
}
