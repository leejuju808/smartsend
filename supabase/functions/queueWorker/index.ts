import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gmailSend } from "../_shared/providers/gmail.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SERVICE_TOKEN = Deno.env.get("SERVICE_WEBHOOK_SECRET")!; // shared secret to call this worker
const DEFAULT_BATCH = 50;

serve(async (req) => {
  try {
    // auth: simple bearer shared secret
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SERVICE_TOKEN)) {
      return json({ error: "unauthorized" }, 401);
    }

    const { campaign_id, batch_size } = await safeJson(req).catch(() => ({}));
    const BATCH = Number(batch_size || DEFAULT_BATCH);

    // optional cap by campaign and rate_per_minute
    const rate = await getRateLimit(campaign_id);
    const take = Math.min(BATCH, rate);

    // 1) atomically claim jobs that are due
    const { data: claimed, error: claimErr } = await supabase.rpc(
      "claim_send_jobs",
      { p_limit: take, p_campaign_id: campaign_id ?? null }
    );
    if (claimErr) throw claimErr;

    if (!claimed?.length) return json({ ok: true, claimed: 0 });

    // 2) send loop
    let sent = 0, failed = 0;
    for (const job of claimed as any[]) {
      try {
        const provider = job.provider || "gmail"; // default

        // Apply tracking token into HTML before sending
        const token = String(job.tracking_token || cryptoRandomSuffix());
        const htmlWithToken = applyTrackingToken(job?.payload?.html || "", token);

        // Ensure token is persisted if previously null
        if (!job.tracking_token) {
          await supabase.from("send_queue").update({ tracking_token: token }).eq("id", job.id);
        }

        const result = await sendViaProvider(provider, {
          ...job,
          payload: {
            ...job.payload,
            html: htmlWithToken
          }
        });

        // Save provider ids onto lead for reply detection
        await supabase.from("leads").update({
          outbound_thread_id: result.threadId ?? null,
          outbound_message_id: result.messageId ?? null
        }).eq("id", job.lead_id);

        // Mark sent
        await supabase.from("send_queue").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_thread_id: result.threadId ?? null,
          provider_message_id: result.messageId ?? null,
          last_error: null
        }).eq("id", job.id);

        // Log
        await supabase.from("campaign_logs").insert({
          campaign_id: job.campaign_id,
          lead_id: job.lead_id,
          level: "info",
          event: "email_sent",
          meta: {
            provider,
            subject: job.payload?.subject,
            to: job.payload?.to,
            providerThreadId: result.threadId,
            providerMessageId: result.messageId
          }
        });

        sent++;
      } catch (e) {
        failed++;
        const backoffMin = computeBackoff(job.attempt + 1);
        const nextAt = new Date(Date.now() + backoffMin * 60_000).toISOString();

        // increment attempt and set failed (or keep queued if you want auto-retry)
        const exceeded = (job.attempt + 1) >= job.max_attempts;

        await supabase.from("send_queue").update({
          status: exceeded ? "failed" : "queued",
          attempt: job.attempt + 1,
          last_error: String((e as any)?.message || e),
          scheduled_at: exceeded ? job.scheduled_at : nextAt
        }).eq("id", job.id);

        await supabase.from("campaign_logs").insert({
          campaign_id: job.campaign_id,
          lead_id: job.lead_id,
          level: exceeded ? "error" : "warn",
          event: exceeded ? "email_send_failed" : "email_send_retry_scheduled",
          meta: { error: String((e as any)?.message || e), nextAttemptAt: nextAt, attempt: job.attempt + 1 }
        });
      }
    }

    return json({ ok: true, claimed: claimed.length, sent, failed });
  } catch (e: any) {
    console.error(e);
    return json({ error: e.message || "worker_error" }, 500);
  }
});

/** ---------------- helpers ---------------- */

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function safeJson(req: Request) {
  const txt = await req.text();
  if (!txt) return {};
  return JSON.parse(txt);
}

// Respect per-campaign rate, default 30 per run
async function getRateLimit(campaign_id?: string | null) {
  if (!campaign_id) return 30;
  const { data, error } = await supabase
    .from("campaigns")
    .select("rate_per_minute")
    .eq("id", campaign_id)
    .maybeSingle();
  if (error || !data) return 30;
  return Math.max(1, data.rate_per_minute);
}

// Exponential backoff: 1, 5, 15, 30 min…
function computeBackoff(attempt: number) {
  const steps = [1, 5, 15, 30, 60];
  return steps[Math.min(steps.length - 1, attempt - 1)];
}

/**
 * Provider abstraction.
 */
async function sendViaProvider(provider: string, job: any): Promise<{ threadId?: string; messageId?: string; }> {
  const payload = job.payload || {};
  if (!payload.to || !payload.subject || !payload.html) {
    throw new Error("missing_payload_fields");
  }

  if (provider === "gmail") {
    const res = await gmailSend({
      from_user_id: payload.from_user_id,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
    return res;
  }

  // Future providers
  // if (provider === "outlook") return outlookSend(...);

  throw new Error(`unknown_provider:${provider}`);
}

function cryptoRandomSuffix() {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Replace {{TRACK_TOKEN}} placeholders with the actual token before sending
function applyTrackingToken(html: string, token: string) {
  return (html || "").replaceAll("{{TRACK_TOKEN}}", token);
}
