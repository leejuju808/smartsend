// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sbAdmin, gmailFetchBy, outlookFetchBy } from "../_shared/oauth.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

const MAX_ACCOUNTS = 10;
const BATCH_PER_ACCOUNT = 15;
const ATTEMPT_LIMIT = 5;

function intervalToMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.milliseconds === "number") return obj.milliseconds;
    const toNumber = (n: unknown) => (typeof n === "number" ? n : typeof n === "string" ? Number(n) : 0);
    const days = toNumber(obj.days);
    const hours = toNumber(obj.hours);
    const minutes = toNumber(obj.minutes);
    const seconds = toNumber(obj.seconds);
    const millis = toNumber(obj.milliseconds);
    if (days || hours || minutes || seconds || millis) {
      return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000 + millis;
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const regex = /^(?:(-?\d+)\s+days?\s+)?(?:(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?)?$/i;
    const match = trimmed.match(regex);
    if (match) {
      const [, dayStr, hStr, mStr, sStr, fracStr] = match;
      const days = dayStr ? Number(dayStr) : 0;
      const hours = hStr ? Number(hStr) : 0;
      const minutes = mStr ? Number(mStr) : 0;
      const seconds = sStr ? Number(sStr) : 0;
      const frac = fracStr ? Number(`0.${fracStr}`) : 0;
      if ([days, hours, minutes, seconds, frac].some((n) => !Number.isNaN(n))) {
        return (((days * 24 + hours) * 60 + minutes) * 60 + seconds + frac) * 1000;
      }
    }
  }

  return null;
}

type SupabaseClient = ReturnType<typeof sbAdmin>;

async function claimJobs(sb: SupabaseClient, accountId: string) {
  const { data, error } = await sb.rpc("claim_provider_jobs", {
    p_account: accountId,
    p_limit: BATCH_PER_ACCOUNT,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

async function listHotAccounts(sb: SupabaseClient) {
  const { data, error } = await sb
    .from("provider_message_queue")
    .select("account_id")
    .eq("status", "queued")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(MAX_ACCOUNTS);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((d: any) => d.account_id))).filter(Boolean);
}

async function fetchGmail(accountId: string, providerMessageId: string) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(providerMessageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=Message-Id`;
  const res = await gmailFetchBy({ id: accountId }, url);
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message ?? JSON.stringify(j));
  return j;
}

async function fetchOutlook(accountId: string, providerMessageId: string) {
  const url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(providerMessageId)}?$select=subject,from,toRecipients,receivedDateTime,conversationId,conversationIndex,internetMessageId`;
  const res = await outlookFetchBy({ id: accountId }, url);
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message ?? JSON.stringify(j));
  return j;
}

async function complete(sb: SupabaseClient, job: any, payload: any) {
  await sb
    .from("provider_message_payloads")
    .upsert(
      {
        account_id: job.account_id,
        provider: job.provider,
        provider_message_id: job.provider_message_id,
        payload,
      },
      { onConflict: "account_id,provider_message_id" },
    );

  await sb
    .from("provider_message_queue")
    .update({ status: "done", last_error: null })
    .eq("id", job.id);
}

async function fail(sb: SupabaseClient, job: any, err: any) {
  const message = typeof err === "string" ? err : (err?.message ?? JSON.stringify(err));
  const data: Record<string, any> = {
    status: "failed",
    last_error: message,
    run_at: new Date(Date.now() + 60_000).toISOString(),
  };

  if (job.attempts >= ATTEMPT_LIMIT) {
    data.status = "dead";
    data.run_at = null;
  } else {
    const { data: delayData, error: delayError } = await sb.rpc("pmq_retry_delay", { p_attempts: job.attempts });
    const nextMs = delayError ? null : intervalToMs(delayData);
    data.run_at = new Date(Date.now() + (nextMs ?? 60_000)).toISOString();
  }

  await sb
    .from("provider_message_queue")
    .update(data)
    .eq("id", job.id);
}

Deno.serve(async (req) => {
  try {
    if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const sb = sbAdmin();
    const accounts = await listHotAccounts(sb);

    for (const accountId of accounts) {
      const accountClient = sbAdmin();
      const jobs = await claimJobs(accountClient, accountId);
      if (!jobs?.length) continue;

      await Promise.all(jobs.map(async (job) => {
        try {
          const payload = job.provider === "gmail"
            ? await fetchGmail(accountId, job.provider_message_id)
            : await fetchOutlook(accountId, job.provider_message_id);
          await complete(accountClient, job, payload);
        } catch (error) {
          await fail(accountClient, job, error);
        }
      }));
    }

    return new Response(
      JSON.stringify({ ok: true, accounts: accounts.length }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
});


