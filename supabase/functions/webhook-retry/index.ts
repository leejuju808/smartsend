import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type DeliveryRow = {
  id: string;
  webhook_id: string;
  campaign_id: string;
  event_id: string;
  attempt: number;
};

type WebhookRow = {
  id: string;
  url: string;
  secret: string | null;
  enabled: boolean;
};

type EventRow = {
  id: string;
  campaign_id: string;
  created_at: string;
  type: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  invite_id: string | null;
  meta: Record<string, unknown> | null;
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const textEncoder = new TextEncoder();
const isSlack = (url: string) => url.includes("hooks.slack.com");

Deno.serve(async () => {
  const now = new Date().toISOString();

  const { data: due, error: dueError } = await sb
    .from("webhook_deliveries")
    .select("id,webhook_id,campaign_id,event_id,attempt")
    .eq("status", "failed")
    .lte("next_attempt_at", now)
    .limit(50);

  if (dueError) {
    return new Response(dueError.message, { status: 500 });
  }

  if (!due?.length) {
    return new Response("ok");
  }

  const webhookIds = Array.from(new Set(due.map((d) => d.webhook_id)));
  const eventIds = Array.from(new Set(due.map((d) => d.event_id)));

  const [{ data: hooks, error: hooksError }, { data: events, error: eventsError }] = await Promise.all([
    sb.from("campaign_webhooks").select("id,url,secret,enabled").in("id", webhookIds),
    sb
      .from("campaign_events")
      .select("id,campaign_id,created_at,type,actor_user_id,target_user_id,invite_id,meta")
      .in("id", eventIds),
  ]);

  if (hooksError || eventsError) {
    const message = hooksError?.message ?? eventsError?.message ?? "unknown_error";
    return new Response(message, { status: 500 });
  }

  const hookMap = new Map((hooks as WebhookRow[]).map((h) => [h.id, h]));
  const evtMap = new Map((events as EventRow[]).map((e) => [e.id, e]));

  await Promise.allSettled((due as DeliveryRow[]).map((row) => processDelivery(row, hookMap, evtMap)));

  return new Response("ok");
});

async function processDelivery(
  row: DeliveryRow,
  hookMap: Map<string, WebhookRow>,
  evtMap: Map<string, EventRow>,
) {
  const hook = hookMap.get(row.webhook_id);
  const evt = evtMap.get(row.event_id);

  if (!hook || !evt || !hook.enabled) {
    await sb
      .from("webhook_deliveries")
      .update({ status: "permanent_fail", error: "hook_missing_or_disabled", next_attempt_at: null })
      .eq("id", row.id);
    return;
  }

  const payload = isSlack(hook.url)
    ? {
        text: `*${evt.type}* • ${evt.campaign_id}\n\`\`\`${JSON.stringify(evt.meta || {}, null, 2)}\`\`\``,
      }
    : evt;

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Smartsend-Event": evt.type,
    "X-Smartsend-Id": evt.id,
  };

  if (hook.secret) {
    const signature = await hmacSha256Hex(hook.secret, body);
    headers["X-Smartsend-Signature"] = `sha256=${signature}`;
  }

  const started = Date.now();

  try {
    const res = await fetch(hook.url, { method: "POST", headers, body });
    const ms = Date.now() - started;

    if (res.ok) {
      await sb
        .from("webhook_deliveries")
        .update({
          status: "success",
          response_status: res.status,
          response_ms: ms,
          request_body: evt,
          next_attempt_at: null,
        })
        .eq("id", row.id);
    } else {
      await handleFailure(row, `HTTP ${res.status}`, res.status, ms, evt);
    }
  } catch (err: unknown) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : "network_error";
    await handleFailure(row, message, null, ms, evt);
  }
}

async function handleFailure(
  row: DeliveryRow,
  error: string,
  responseStatus: number | null,
  responseMs: number,
  evt: EventRow,
) {
  const nextAttempt = row.attempt + 1;
  const stop = nextAttempt > 6;

  await sb
    .from("webhook_deliveries")
    .update({
      attempt: nextAttempt,
      status: stop ? "permanent_fail" : "failed",
      response_status: responseStatus,
      response_ms: responseMs,
      error,
      next_attempt_at: stop ? null : new Date(Date.now() + backoffMs(nextAttempt)).toISOString(),
      request_body: evt,
    })
    .eq("id", row.id);
}

function backoffMs(attempt: number) {
  return (
    attempt <= 1 ? 1 : attempt === 2 ? 5 : attempt === 3 ? 15 : attempt === 4 ? 60 : attempt === 5 ? 180 : 720
  ) * 60 * 1000;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

