import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USAGE_BUMP_URL = Deno.env.get("USAGE_BUMP_URL")!;

const GMAIL_RPM = Number(Deno.env.get("GMAIL_RPM") ?? 60);
const OUTLOOK_RPM = Number(Deno.env.get("OUTLOOK_RPM") ?? 30);
const SIM_RPM = Number(Deno.env.get("SIM_RPM") ?? 300);

type Provider = "gmail" | "outlook" | "sim";

type Job = {
  id: string;
  campaign_id: string;
  lead_id: string;
  from_account_id: string;
  step_no: number;
  payload: any;
  provider: Provider | null;
  run_at: string;
};

type Bucket = { tokens: number; last: number; rpm: number };

const buckets = new Map<string, Bucket>();

function rpmFor(provider: Provider | null): number {
  if (provider === "outlook") return OUTLOOK_RPM;
  if (provider === "sim") return SIM_RPM;
  return GMAIL_RPM;
}

function canSend(provider: Provider | null, accountId: string): boolean {
  const rpm = rpmFor(provider ?? "gmail");
  const key = `${provider ?? "gmail"}:${accountId}`;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: rpm, last: now, rpm };

  const elapsedSeconds = (now - bucket.last) / 1000;
  const refill = (bucket.rpm / 60) * elapsedSeconds;
  bucket.tokens = Math.min(bucket.rpm, bucket.tokens + refill);
  bucket.last = now;

  const ok = bucket.tokens >= 1;
  if (ok) {
    bucket.tokens -= 1;
  }
  buckets.set(key, bucket);
  return ok;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { batch_per_account = 25, account_ids } = (await req.json().catch(() => ({}))) ?? {};
    const sb = createClient(SB_URL, SRK);
    const nowIso = new Date().toISOString();

    const { data: accounts, error: accountErr } = await sb
      .from("send_queue")
      .select("from_account_id, provider")
      .in("status", ["queued", "retry"])
      .lte("run_at", nowIso)
      .order("run_at", { ascending: true });

    if (accountErr) {
      console.error("account query error", accountErr);
      return new Response(JSON.stringify({ ok: false, error: accountErr.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const uniqueAccounts: string[] =
      Array.isArray(account_ids) && account_ids.length
        ? [...new Set(account_ids)]
        : Array.from(new Set((accounts ?? []).map((row: any) => row.from_account_id))).filter(Boolean);

    if (!uniqueAccounts.length) {
      return new Response(JSON.stringify({ ok: true, results: [] }), {
        headers: { "content-type": "application/json" },
      });
    }

    const results: Array<{ id: string; status: string; reason?: string }> = [];

    for (const accountId of uniqueAccounts) {
      const { data: claimed, error: claimErr } = await sb.rpc("claim_send_jobs", {
        p_account: accountId,
        p_limit: batch_per_account,
      });

      if (claimErr) {
        console.error("claim_send_jobs error", claimErr);
        continue;
      }

      const claimedIds = (claimed ?? []).map((row: any) => row.id);
      if (!claimedIds.length) continue;

      const { data: jobs, error: jobsErr } = await sb
        .from("send_queue")
        .select("id, campaign_id, lead_id, from_account_id, step_no, payload, provider, run_at")
        .in("id", claimedIds);

      if (jobsErr) {
        console.error("send_queue fetch error", jobsErr);
        continue;
      }

      for (const job of (jobs ?? []) as Job[]) {
        const provider = (job.provider ?? "gmail") as Provider;
        if (!canSend(provider, job.from_account_id)) {
          await sb.rpc("reschedule_with_backoff", { p_id: job.id, p_reason: "rate_limited" });
          results.push({ id: job.id, status: "retry", reason: "rate_limited" });
          continue;
        }

        const bumpRes = await fetch(USAGE_BUMP_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ account_id: job.from_account_id, amount: 1 }),
        });

        if (bumpRes.status === 402) {
          await sb
            .from("send_queue")
            .update({
              status: "paused",
              last_error: "quota_exceeded",
            })
            .eq("id", job.id);

          results.push({ id: job.id, status: "paused", reason: "quota_exceeded" });
          continue;
        }

        if (!bumpRes.ok) {
          await sb.rpc("reschedule_with_backoff", { p_id: job.id, p_reason: `usage_bump_${bumpRes.status}` });
          results.push({ id: job.id, status: "retry", reason: `usage_bump_${bumpRes.status}` });
          continue;
        }

        try {
          const sendResult = await sendMessage(sb, job);

          await sb
            .from("send_queue")
            .update({
              status: "sent",
              provider_message_id: sendResult.provider_message_id,
              provider_thread_id: sendResult.provider_thread_id ?? null,
            })
            .eq("id", job.id);

          await logDelivery(sb, job, "sent", {
            provider_message_id: sendResult.provider_message_id,
            provider_thread_id: sendResult.provider_thread_id ?? null,
          });

          results.push({ id: job.id, status: "sent" });
        } catch (err) {
          const message = (err as Error).message ?? "send_failed";
          const soft = /rate|timeout|429|5\d\d|temporar/i.test(message);

          if (soft) {
            await sb.rpc("reschedule_with_backoff", { p_id: job.id, p_reason: message });
            results.push({ id: job.id, status: "retry", reason: message });
          } else {
            await sb
              .from("send_queue")
              .update({
                status: "failed",
                last_error: message,
              })
              .eq("id", job.id);

            await logDelivery(sb, job, "failed", { error: message });
            results.push({ id: job.id, status: "failed", reason: message });
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("send-tick-v2 error", error);
    return new Response((error as Error).message, { status: 500 });
  }
});

async function sendMessage(
  sb: ReturnType<typeof createClient>,
  job: Job
): Promise<{ provider_message_id: string; provider_thread_id?: string }> {
  const provider = (job.provider ?? "gmail") as Provider;

  const { data: account, error: accountErr } = await sb
    .from("connected_accounts")
    .select("id, provider, email, access_token, refresh_token, expires_at, meta")
    .eq("id", job.from_account_id)
    .maybeSingle();

  if (accountErr) {
    console.error("connected_accounts fetch error", accountErr);
    throw new Error("account_lookup_failed");
  }

  if (!account) {
    throw new Error("account_missing");
  }

  // Simulate sending latency; replace with provider API integration.
  await sleep(50 + Math.random() * 100);

  if (job.payload?.force_error) {
    throw new Error("hard_validation_error");
  }

  return {
    provider_message_id: `msg_${provider}_${job.id.slice(0, 8)}_${Date.now()}`,
    provider_thread_id: `thr_${job.lead_id.slice(0, 8)}`,
  };
}

async function logDelivery(
  sb: ReturnType<typeof createClient>,
  job: Job,
  kind: "sent" | "failed",
  meta: Record<string, unknown>
) {
  try {
    await sb.from("delivery_events").insert({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      campaign_id: job.campaign_id,
      lead_id: job.lead_id,
      kind,
      meta: {
        step_no: job.step_no,
        queue_id: job.id,
        provider: job.provider ?? "gmail",
        ...meta,
      },
    });
  } catch (err) {
    console.error("logDelivery error", err);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}





