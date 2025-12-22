/* eslint-disable */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore - remote Deno import resolved at runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Provide a loose declaration so Node-based tooling recognises the global when linting.
declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MAX_BATCH = Number(Deno.env.get("SEND_TICK_MAX_BATCH") ?? "10");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing Supabase environment configuration");
}

const admin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

type QueuePayload = {
  subject?: string;
  to?: string;
  [key: string]: unknown;
} | null;

type QueueRow = {
  id: string;
  account_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  step_no: number | null;
  variant_id: string | null;
  payload: QueuePayload;
};

Deno.serve(async () => {
  if (!admin) {
    return new Response(JSON.stringify({ ok: false, error: "missing_config" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const processed: string[] = [];
  const nowIso = () => new Date().toISOString();

  for (let i = 0; i < MAX_BATCH; i++) {
    const { data: id, error: dequeueErr } = await admin.rpc("dequeue_next_send", {});
    if (dequeueErr) {
      console.error("dequeue_next_send error", dequeueErr);
      break;
    }

    if (!id) {
      break;
    }

    const { data: q, error: fetchErr } = await admin
      .from("send_queue")
      .select("id, account_id, campaign_id, lead_id, step_no, variant_id, payload")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !q) {
      console.error("Failed to load queue row", { id, fetchErr });
      await admin
        .from("send_queue")
        .update({ status: "failed", locked_at: null, updated_at: nowIso() })
        .eq("id", id);
      continue;
    }

    const queue = q as QueueRow;

    const payload = queue.payload && typeof queue.payload === "object"
      ? queue.payload
      : null;
    const subject = payload && typeof payload.subject === "string" ? payload.subject : null;
    const toEmail = payload && typeof payload.to === "string" ? payload.to : null;

    let logId: string | null = null;

    try {
      const { data: logRow, error: logErr } = await admin
        .from("send_logs")
        .insert({
          queue_id: queue.id,
          campaign_id: queue.campaign_id,
          account_id: queue.account_id,
          lead_id: queue.lead_id,
          step_no: queue.step_no,
          variant_id: queue.variant_id,
          status: "sending",
          provider: "gmail",
          provider_message_id: null,
          provider_thread_id: null,
          subject_snapshot: subject,
          to_email: toEmail,
          created_at: nowIso(),
        })
        .select("id")
        .single();

      if (logErr) {
        throw logErr;
      }

      logId = logRow?.id ?? null;

      // TODO: integrate real provider send here; currently stubbed
      const provider = "gmail" as const;
      const providerMessageId = `stub_${crypto.randomUUID()}`;

      if (logId) {
        await admin
          .from("send_logs")
          .update({
            status: "sent",
            sent_at: nowIso(),
            provider,
            provider_message_id: providerMessageId,
          })
          .eq("id", logId);
      }

      await admin.rpc("record_send_success", { p_id: queue.id });
      await admin
        .from("send_queue")
        .update({ last_error: null })
        .eq("id", queue.id);

      processed.push(queue.id);
    } catch (err: any) {
      console.error("tick_sender processing error", err);

      const code = err?.code || err?.statusCode || err?.status || "ERR";
      const msg = (err?.message || String(err)).slice(0, 2000);
      const provider = "gmail"; // TODO: detect provider dynamically

      if (logId) {
        await admin
          .from("send_logs")
          .update({
            status: "failed",
            error: msg,
            updated_at: nowIso(),
          })
          .eq("id", logId);
      }

      const permanent = isPermanentError(err);
      const { data: outcome, error: failureErr } = await admin.rpc("record_send_failure", {
        p_id: queue.id,
        p_permanent: permanent,
      });
      await admin
        .from("send_queue")
        .update({ last_error: msg })
        .eq("id", queue.id);

      if (failureErr) {
        console.error("record_send_failure error", failureErr);
      } else if (outcome === "dead_letter") {
        console.warn("queue item moved to dead-letter", { queueId: queue.id });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { "content-type": "application/json" },
  });
});

function isPermanentError(err: any): boolean {
  const msg = String(err?.message ?? err).toLowerCase();

  if (msg.includes("invalid_grant")) return true;
  if (msg.includes("invalid_scope")) return true;
  if (msg.includes("550 5.1.1") || msg.includes("user unknown")) return true;
  if (
    msg.includes("invalid to header") ||
    (msg.includes("recipient") && msg.includes("invalid"))
  ) {
    return true;
  }

  return false;
}

