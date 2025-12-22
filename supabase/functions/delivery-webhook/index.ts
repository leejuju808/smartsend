import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type Norm = {
  provider: string;
  type: 'bounce'|'deferred'|'delivered'|'complaint';
  hard?: boolean;
  send_log_id?: string;          // if you store it as custom arg
  provider_event_id?: string;
  smtp_code?: string;
  smtp_subcode?: string;
  diagnostic?: string;
  target_email?: string;
  provider_message_id?: string;
};

// ----------------- Provider normalizers -----------------

async function normSES(payload: any): Promise<Norm[]> {
  // Expect AWS SNS/SES webhook -> already JSON-decoded by caller
  // You'll likely terminate SNS signature at the edge of your infra; this is a simplified mapper.
  const recs: Norm[] = [];
  const m = payload?.mail;
  const event = payload?.eventType;
  const item = payload?.bounce || payload?.delivery || payload?.complaint || payload?.deliveryDelay;
  const pmid = m?.messageId;
  const targets = (item?.bouncedRecipients || item?.recipients || item?.complainedRecipients || []).map((r: any) => r.emailAddress || r);
  const smtp = item?.smtpResponse || "";
  const code = smtp.match(/\b(\d{3})\b/)?.[1];
  const diag = item?.diagnosticCode || item?.reportingMTA || smtp || payload?.failure || '';

  let type: 'bounce'|'delivered'|'complaint'|'deferred' = 'deferred';
  let hard: boolean | undefined = undefined;
  if (event === 'Bounce') { 
    type = 'bounce'; 
    hard = (payload?.bounce?.bounceType === 'Permanent'); 
  }
  if (event === 'Delivery') type = 'delivered';
  if (event === 'Complaint') type = 'complaint';
  if (event === 'DeliveryDelay') type = 'deferred';

  for (const email of targets.length ? targets : [undefined]) {
    recs.push({
      provider: 'ses',
      type, 
      hard,
      provider_message_id: pmid,
      provider_event_id: payload?.notificationType || payload?.eventId,
      smtp_code: code,
      diagnostic: diag,
      target_email: email
    });
  }
  return recs;
}

async function normSendGrid(payload: any): Promise<Norm[]> {
  // SendGrid posts an array of events
  const arr = Array.isArray(payload) ? payload : [payload];
  return arr.map((e: any) => ({
    provider: 'sendgrid',
    type: e.event === 'bounce' ? 'bounce'
        : e.event === 'deferred' ? 'deferred'
        : e.event === 'delivered' ? 'delivered'
        : e.event === 'spamreport' ? 'complaint'
        : 'deferred',
    hard: e.event === 'bounce' ? (String(e.reason || '').toLowerCase().includes('permanent') || /^5\d\d/.test(e.status || '')) : undefined,
    provider_event_id: e.sg_event_id,
    provider_message_id: e.sg_message_id,
    smtp_code: e.status,
    diagnostic: e.reason,
    target_email: e.email
  }));
}

async function normMailgun(payload: any): Promise<Norm[]> {
  const e = payload['event-data'] || payload;
  const ev = e.event;
  const severity = e.severity;
  const code = e.delivery_status?.code;
  const diag = e.delivery_status?.message || e.reason;
  const pmid = e.message?.headers?.['message-id'];
  const email = e.recipient;

  let type: 'bounce'|'deferred'|'delivered'|'complaint' = 'deferred';
  if (ev === 'delivered') type = 'delivered';
  if (ev === 'complained') type = 'complaint';
  if (ev === 'failed') type = (severity === 'permanent') ? 'bounce' : 'deferred';

  return [{
    provider: 'mailgun',
    type,
    hard: type === 'bounce' ? severity === 'permanent' : undefined,
    provider_event_id: e.id,
    provider_message_id: pmid,
    smtp_code: String(code || ''),
    diagnostic: diag,
    target_email: email
  }];
}

// Fallback (you can add Outlook/Gmail parsing if you forward MDNs)
async function normGeneric(payload: any): Promise<Norm[]> {
  const n: Norm = {
    provider: 'generic',
    type: payload.type || 'deferred',
    hard: payload.hard,
    provider_event_id: payload.id,
    provider_message_id: payload.provider_message_id,
    smtp_code: payload.smtp_code,
    diagnostic: payload.diagnostic,
    target_email: payload.email
  };
  return [n];
}

// ----------------- Insert + attribution -----------------

async function attachAndUpsert(n: Norm) {
  // If you can not map to send_log by provider_message_id, still store the event.
  // Try match by provider_message_id first
  let sendLogId = n.send_log_id;

  if (!sendLogId && n.provider_message_id) {
    const { data: sl } = await sb.from("send_logs")
      .select("id")
      .eq("provider_message_id", n.provider_message_id)
      .limit(1)
      .maybeSingle();
    sendLogId = sl?.id;
  }

  const { data: ins, error: insError } = await sb.from("delivery_events").insert({
    send_log_id: sendLogId ?? null,
    type: n.type,
    hard: n.hard ?? null,
    provider: n.provider,
    provider_event_id: n.provider_event_id ?? null,
    smtp_code: n.smtp_code ?? null,
    smtp_subcode: n.smtp_subcode ?? null,
    diagnostic: n.diagnostic ?? null,
    target_email: n.target_email ?? null
  }).select("id, send_log_id").single();

  if (insError) {
    console.error("Error inserting delivery event:", insError);
    return;
  }

  // Update send_log status where possible
  if (ins?.send_log_id) {
    if (n.type === 'delivered') {
      await sb.from("send_logs").update({ status: 'sent' }).eq("id", ins.send_log_id);
    } else if (n.type === 'bounce') {
      await sb.from("send_logs").update({
        status: "bounced",
        error_code: n.smtp_code ?? null,
        error_message: n.diagnostic ?? null,
      }).eq("id", ins.send_log_id);

      if (n.hard === true) {
        await sb.rpc("suppress_on_hard_bounce", { p_send_log: ins.send_log_id });
      }

      const { data: logRow } = await sb
        .from("send_logs")
        .select("queue_id, lead_id, campaign_id, account_id")
        .eq("id", ins.send_log_id)
        .maybeSingle();

      const ledgerAccountId = logRow?.account_id ?? null;
      const queueId = logRow?.queue_id ?? null;

      if (ledgerAccountId && logRow?.lead_id) {
        let sendId: string | null = null;

        if (queueId) {
          const { data: sendByQueue } = await sb
            .from("email_sends")
            .select("id")
            .eq("account_id", ledgerAccountId)
            .eq("meta->>queue_id", String(queueId))
            .maybeSingle();
          sendId = sendByQueue?.id ?? null;
        }

        if (!sendId) {
          const { data: sendFallback } = await sb
            .from("email_sends")
            .select("id")
            .eq("account_id", ledgerAccountId)
            .eq("lead_id", logRow.lead_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          sendId = sendFallback?.id ?? null;
        }

        if (sendId) {
          await sb.from("email_events").insert({
            account_id: ledgerAccountId,
            send_id: sendId,
            type: "bounce",
            meta: {
              queue_id: queueId ?? null,
              diagnostic: n.diagnostic ?? null,
              smtp_code: n.smtp_code ?? null,
            },
          }).catch(() => {});
        }
      }
    } else if (n.type === 'complaint') {
      await sb.from("send_logs").update({ 
        status: 'blocked', 
        error_message: 'complaint' 
      }).eq("id", ins.send_log_id);
    }
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("POST required", { status: 405 });
    }

    const provider = (new URL(req.url)).searchParams.get("provider") || "generic";
    const body = await req.json();

    let events: Norm[] = [];
    if (provider === 'ses') {
      events = await normSES(body);
    } else if (provider === 'sendgrid') {
      events = await normSendGrid(body);
    } else if (provider === 'mailgun') {
      events = await normMailgun(body);
    } else {
      events = await normGeneric(body);
    }

    for (const e of events) {
      await attachAndUpsert(e);
    }

    return new Response(
      JSON.stringify({ ok: true, count: events.length }), 
      { 
        headers: { "content-type": "application/json" } 
      }
    );
  } catch (e) {
    console.error("Delivery webhook error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }), 
      { 
        status: 500, 
        headers: { "content-type": "application/json" } 
      }
    );
  }
});

