import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";

type NormalizedRow = {
  event_type: string;
  subtype?: string | null;
  rcpt_email?: string | null;
  ext_id?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown> | any;
};

type NormalizedPayload = {
  provider: string;
  rows: NormalizedRow[];
};

function mapSendgrid(ev: string): string {
  switch (ev) {
    case "delivered":
      return "delivered";
    case "open":
      return "open";
    case "click":
      return "click";
    case "bounce":
      return "bounce";
    case "dropped":
      return "blocked";
    case "spamreport":
      return "complaint";
    case "unsubscribe":
      return "unsubscribe";
    case "deferred":
      return "deferred";
    default:
      return ev;
  }
}

function mapSes(msg: any): NormalizedRow[] {
  if (msg.notificationType === "Bounce") {
    const subtype = (msg.bounce?.bounceType ?? "").toLowerCase() === "permanent"
      ? "hard"
      : "soft";
    return (msg.bounce?.bouncedRecipients ?? []).map((r: any) => ({
      event_type: "bounce",
      subtype,
      rcpt_email: r.emailAddress,
      ext_id: msg.mail?.messageId,
      reason: msg.bounce?.bounceSubType ?? null,
      meta: msg,
    }));
  }

  if (msg.notificationType === "Complaint") {
    return (msg.complaint?.complainedRecipients ?? []).map((r: any) => ({
      event_type: "complaint",
      subtype: "feedback-loop",
      rcpt_email: r.emailAddress,
      ext_id: msg.mail?.messageId,
      reason: msg.complaint?.complaintFeedbackType ?? null,
      meta: msg,
    }));
  }

  if (msg.notificationType === "Delivery") {
    return [{
      event_type: "delivered",
      subtype: null,
      rcpt_email: msg.mail?.destination?.[0],
      ext_id: msg.mail?.messageId,
      reason: null,
      meta: msg,
    }];
  }

  return [];
}

function mapPostmark(body: any): NormalizedRow[] {
  const base = { ext_id: body.MessageID, meta: body };

  if (body.RecordType === "Bounce") {
    const typeName = (body.TypeName || "").toLowerCase();
    return [{
      event_type: "bounce",
      subtype: typeName.includes("hard") ? "hard" : "soft",
      rcpt_email: body.Email,
      reason: body.Description,
      ...base,
    }];
  }

  if (body.RecordType === "SpamComplaint") {
    return [{
      event_type: "complaint",
      subtype: "spam",
      rcpt_email: body.Email,
      reason: body.Description,
      ...base,
    }];
  }

  return [];
}

function mapMailgun(event: string): string {
  switch (event) {
    case "delivered":
      return "delivered";
    case "opened":
      return "open";
    case "clicked":
      return "click";
    case "bounced":
    case "failed":
    case "permanent_fail":
      return "bounce";
    case "temporary_fail":
      return "deferred";
    case "complained":
      return "complaint";
    case "unsubscribed":
      return "unsubscribe";
    default:
      return event;
  }
}

function norm(body: any, _headers: Headers): NormalizedPayload {
  if (Array.isArray(body) && body[0]?.event) {
    return {
      provider: "sendgrid",
      rows: body.map((e: any) => ({
        event_type: mapSendgrid(e.event),
        subtype: e.reason || e.type || null,
        rcpt_email: e.email,
        ext_id: e.sg_message_id || e["smtp-id"] || null,
        reason: e.reason || e.response || null,
        meta: e,
      })),
    };
  }

  if (body?.event && body?.event?.Type === "Notification" && body?.Message) {
    try {
      const msg = JSON.parse(body.Message);
      return { provider: "ses", rows: mapSes(msg) };
    } catch {
      return { provider: "ses", rows: [] };
    }
  }

  if (body?.signature && body?.event?.event) {
    const ev = body.event.event;
    if (Array.isArray(body?.event?.items)) {
      return {
        provider: "mailgun",
        rows: body.event.items.map((item: any) => ({
          event_type: mapMailgun(item.event),
          subtype: item.severity || item.reason || null,
          rcpt_email: item.recipient,
          ext_id: item["Message-Id"] || item.id || null,
          reason: item.description || null,
          meta: item,
        })),
      };
    }
    return {
      provider: "mailgun",
      rows: [{
        event_type: mapMailgun(ev),
        subtype: body.event.severity || null,
        rcpt_email: body.event.recipient,
        ext_id: body.event["Message-Id"] || null,
        reason: body.event.description || null,
        meta: body.event,
      }],
    };
  }

  if (body?.RecordType === "Bounce" || body?.RecordType === "SpamComplaint") {
    return { provider: "postmark", rows: mapPostmark(body) };
  }

  return { provider: "smtp", rows: [] };
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const text = await req.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  const { provider, rows } = norm(body, req.headers);

  // TODO: verify signatures per provider (SendGrid v3, SES SNS, Mailgun, Postmark)
  for (const row of rows) {
    await supabase.from("deliverability_events").insert({
      provider,
      account_id: null,
      event_type: row.event_type,
      subtype: row.subtype ?? null,
      rcpt_email: row.rcpt_email ? String(row.rcpt_email).toLowerCase() : null,
      reason: row.reason ?? null,
      ext_message_id: row.ext_id ?? null,
      meta: row.meta ?? {},
    });
  }

  return NextResponse.json({ ok: true, inserted: rows.length, provider });
}


