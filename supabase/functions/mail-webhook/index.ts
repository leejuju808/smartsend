import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NormalizedEvent = {
  provider: string;
  event: "delivered" | "deferred" | "bounce_soft" | "bounce_hard" | "complaint" | "blocked" | "reject";
  account_id?: string | null;
  queue_id?: string | null;
  lead_id?: string | null;
  sender_email?: string | null;
  recipient_email?: string | null;
  message_id?: string | null;
  reason?: string | null;
  details?: Record<string, unknown> | any;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function verifySharedSecret(req: Request): Promise<boolean> {
  const shared = Deno.env.get("MAIL_WEBHOOK_SHARED_SECRET");
  if (!shared) return true;
  const header = req.headers.get("x-mail-webhook-secret") ?? req.headers.get("x-signature");
  return header === shared;
}

function sgNormalize(row: any): NormalizedEvent[] {
  const arr = Array.isArray(row) ? row : [row];
  return arr.map((e: any) => {
    const base: Partial<NormalizedEvent> = {
      provider: "sendgrid",
      account_id: e.account_id ?? e.custom_args?.account_id ?? null,
      queue_id: e.queue_id ?? e.custom_args?.queue_id ?? null,
      lead_id: e.lead_id ?? e.custom_args?.lead_id ?? null,
      sender_email: e.from ?? e.envelope?.from ?? null,
      recipient_email: e.email ?? null,
      message_id: e.sg_message_id ?? null,
      details: e ?? null
    };
    const ev = e.event;
    if (ev === "delivered") return { ...base, event: "delivered" } as NormalizedEvent;
    if (ev === "deferred") return { ...base, event: "deferred", reason: e.response ?? null } as NormalizedEvent;
    if (ev === "bounce") {
      const kind = /invalid/i.test(e.reason ?? "") ? "bounce_hard" : "bounce_soft";
      return { ...base, event: kind as NormalizedEvent["event"], reason: e.reason ?? null } as NormalizedEvent;
    }
    if (ev === "spamreport") return { ...base, event: "complaint", reason: "complaint" } as NormalizedEvent;
    if (ev === "blocked") return { ...base, event: "blocked", reason: e.reason ?? null } as NormalizedEvent;
    if (ev === "dropped") return { ...base, event: "reject", reason: e.reason ?? "policy" } as NormalizedEvent;
    return { ...base, event: "deferred", reason: "unknown" } as NormalizedEvent;
  });
}

function mgNormalize(row: any): NormalizedEvent[] {
  const e = row["event-data"] ?? row;
  const base: Partial<NormalizedEvent> = {
    provider: "mailgun",
    account_id: e.user_variables?.account_id ?? null,
    queue_id: e.user_variables?.queue_id ?? null,
    lead_id: e.user_variables?.lead_id ?? null,
    sender_email: e.message?.headers?.from ?? null,
    recipient_email: e.recipient ?? null,
    message_id: e.message?.headers?.["message-id"] ?? null,
    details: e ?? null
  };
  const ev = e.event;
  if (ev === "delivered") return [{ ...base, event: "delivered" } as NormalizedEvent];
  if (ev === "complained") return [{ ...base, event: "complaint", reason: "complaint" } as NormalizedEvent];
  if (ev === "failed") {
    const hard = e.severity === "permanent";
    return [{ ...base, event: hard ? "bounce_hard" : "bounce_soft", reason: e.reason ?? e["delivery-status"]?.code ?? null } as NormalizedEvent];
  }
  if (ev === "rejected") return [{ ...base, event: "reject", reason: e["reject"]?.reason ?? "policy" } as NormalizedEvent];
  return [{ ...base, event: "deferred", reason: e["delivery-status"]?.description ?? "unknown" } as NormalizedEvent];
}

function sesNormalize(row: any): NormalizedEvent[] {
  const e = row;
  const base: Partial<NormalizedEvent> = { provider: "ses", details: e ?? null };
  if (e.eventType === "Delivery") {
    return [{
      ...base,
      event: "delivered",
      recipient_email: e.mail?.destination?.[0] ?? null,
      message_id: e.mail?.messageId ?? null
    } as NormalizedEvent];
  }
  if (e.eventType === "Bounce") {
    const hard = e.bounce?.bounceType === "Permanent";
    return [{
      ...base,
      event: hard ? "bounce_hard" : "bounce_soft",
      recipient_email: e.bounce?.bouncedRecipients?.[0]?.emailAddress ?? null,
      reason: e.bounce?.bounceSubType ?? "bounce"
    } as NormalizedEvent];
  }
  if (e.eventType === "Complaint") {
    return [{
      ...base,
      event: "complaint",
      recipient_email: e.complaint?.complainedRecipients?.[0]?.emailAddress ?? null,
      reason: "complaint"
    } as NormalizedEvent];
  }
  return [{ ...base, event: "deferred" } as NormalizedEvent];
}

function genericNormalize(row: any): NormalizedEvent[] {
  return [{
    provider: row.provider ?? "custom",
    event: (row.event as NormalizedEvent["event"]) ?? "deferred",
    account_id: row.account_id ?? null,
    queue_id: row.queue_id ?? null,
    lead_id: row.lead_id ?? null,
    sender_email: row.sender ?? null,
    recipient_email: row.recipient ?? null,
    message_id: row.message_id ?? null,
    reason: row.reason ?? null,
    details: row ?? null
  }];
}

async function linkQueueContext(ev: NormalizedEvent): Promise<NormalizedEvent> {
  if (!ev.queue_id) return ev;
  const { data: q } = await sb
    .from("send_queue")
    .select("account_id, lead_id, sender_email, recipient_email")
    .eq("id", ev.queue_id)
    .maybeSingle();
  if (q) {
    ev.account_id = ev.account_id ?? q.account_id;
    ev.lead_id = ev.lead_id ?? q.lead_id;
    ev.sender_email = ev.sender_email ?? q.sender_email;
    ev.recipient_email = ev.recipient_email ?? q.recipient_email;
  }
  return ev;
}

function inferProviderEvent(provider: string, body: any): string {
  if (Array.isArray(body)) {
    const first = body[0];
    return first?.event ?? first?.["event-data"]?.event ?? "batch";
  }
  return body?.event ?? body?.["event-data"]?.event ?? provider ?? "unknown";
}

serve(async (req) => {
  try {
    if (!(await verifySharedSecret(req))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
    }

    const provider = (new URL(req.url)).searchParams.get("p")?.toLowerCase() ?? "custom";
    const rawBody = await req.text();
    const body = rawBody ? JSON.parse(rawBody) : {};

    await sb.from("mail_webhooks_raw").insert({
      provider,
      event: inferProviderEvent(provider, body),
      payload: body
    });

    let items: NormalizedEvent[] = [];
    if (provider === "sendgrid") items = sgNormalize(body);
    else if (provider === "mailgun") items = mgNormalize(body);
    else if (provider === "ses") items = sesNormalize(body);
    else items = genericNormalize(body);

    for (const item of items) {
      const normalized = await linkQueueContext({ ...item });

      const { data: inserted, error: insertErr } = await sb
        .from("mail_events")
        .insert({
          provider: normalized.provider,
          event: normalized.event,
          account_id: normalized.account_id ?? null,
          queue_id: normalized.queue_id ?? null,
          lead_id: normalized.lead_id ?? null,
          sender_email: normalized.sender_email ?? null,
          recipient_email: normalized.recipient_email ?? null,
          message_id: normalized.message_id ?? null,
          reason: normalized.reason ?? null,
          details: normalized.details ?? {}
        })
        .select("id, account_id, recipient_email, sender_email")
        .single();

      if (insertErr) throw insertErr;

      if (
        normalized.queue_id &&
        ["bounce_soft", "bounce_hard", "complaint", "reject", "blocked"].includes(normalized.event)
      ) {
        const kind =
          normalized.event === "bounce_hard" ? "hard_bounce" :
          normalized.event === "bounce_soft" ? "soft_bounce" :
          normalized.event === "complaint" ? "rejected" :
          "rejected";

        await sb.from("send_events").insert({
          account_id: normalized.account_id ?? null,
          queue_id: normalized.queue_id ?? null,
          lead_id: normalized.lead_id ?? null,
          sender_email: normalized.sender_email ?? null,
          recipient_email: normalized.recipient_email ?? null,
          kind,
          provider_id: normalized.message_id ?? null,
          details: {
            webhook_id: inserted?.id ?? null,
            reason: normalized.reason ?? null,
            provider: normalized.provider
          }
        });

        await sb
          .from("send_queue")
          .update({
            state: "failed",
            last_error: `${normalized.event}:${normalized.reason ?? ""}`
          })
          .eq("id", normalized.queue_id)
          .in("state", ["queued", "inflight"]);
      }

      // Block 445: Auto-suppress from bounce/spam events
      if (["bounce_hard", "complaint", "reject"].includes(normalized.event)) {
        const email = normalized.recipient_email ?? null;
        if (!email) continue;
        
        // Get workspace_id from lead or campaign
        let workspaceId: string | null = null;
        if (normalized.lead_id) {
          const { data: lead } = await sb
            .from("leads")
            .select("workspace_id")
            .eq("id", normalized.lead_id)
            .maybeSingle();
          workspaceId = lead?.workspace_id ?? null;
        }
        
        // Fallback: get workspace_id from send_queue -> campaign
        if (!workspaceId && normalized.queue_id) {
          const { data: queue } = await sb
            .from("send_queue")
            .select("campaign_id")
            .eq("id", normalized.queue_id)
            .maybeSingle();
          if (queue?.campaign_id) {
            const { data: campaign } = await sb
              .from("campaigns")
              .select("workspace_id")
              .eq("id", queue.campaign_id)
              .maybeSingle();
            workspaceId = campaign?.workspace_id ?? null;
          }
        }
        
        if (workspaceId) {
          if (normalized.event === "bounce_hard") {
            // Block 12600: Hard bounce → suppress using new suppression system
            await sb.rpc("suppress_contact", {
              p_workspace_id: workspaceId,
              p_email: email.toLowerCase(),
              p_reason: "bounce",
              p_created_by: "system",
              p_created_by_user_id: null,
              p_notes: normalized.reason ?? "Hard bounce detected"
            }).catch(err => console.error("Error suppressing bounce:", err));
            
            // Block 20930: Record bounce event for deliverability tracking
            await sb.from("email_events").insert({
              organization_id: workspaceId,
              event_type: "hard_bounce",
              timestamp: new Date().toISOString(),
              extra: { reason: normalized.reason, provider: normalized.provider }
            }).catch(err => console.error("Error recording bounce event:", err));
          } else if (normalized.event === "complaint") {
            // Block 12600: Spam complaint → suppress using new suppression system
            await sb.rpc("suppress_contact", {
              p_workspace_id: workspaceId,
              p_email: email.toLowerCase(),
              p_reason: "complaint",
              p_created_by: "system",
              p_created_by_user_id: null,
              p_notes: normalized.reason ?? "Spam complaint detected"
            }).catch(err => console.error("Error suppressing spam:", err));
            
            // Block 20930: Record complaint event for deliverability tracking
            await sb.from("email_events").insert({
              organization_id: workspaceId,
              event_type: "spam_complaint",
              timestamp: new Date().toISOString(),
              extra: { reason: normalized.reason, provider: normalized.provider }
            }).catch(err => console.error("Error recording complaint event:", err));
          } else if (normalized.event === "delivered") {
            // Block 20930: Record delivered event
            await sb.from("email_events").insert({
              organization_id: workspaceId,
              event_type: "delivered",
              timestamp: new Date().toISOString(),
              extra: { provider: normalized.provider }
            }).catch(err => console.error("Error recording delivered event:", err));
          }
        }
      }
    }

    await sb.rpc("refresh_mail_health").catch(() => {});

    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("mail-webhook error", error);
    return new Response(JSON.stringify({ error: "SERVER_ERROR", detail: String(error) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});





