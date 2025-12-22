// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAdapter } from "@/lib/enrich/registry";
import { loadVendorSecrets } from "@/lib/enrich/secrets";

type Job = {
  id: string;
  account_id: string;
  lead_id: string;
  source: string;
  cache_key: string;
  attempts: number;
  max_attempts: number;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONCURRENCY = 5;
const BATCH_LIMIT = 50;
const RATE_LIMIT_DELAY_MS = 1_000 * 60 * 60 * 8; // 8h
const FALLBACK_THRESHOLD = 3;

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function backoff(attempts: number, isRateLimited: boolean) {
  const base = isRateLimited ? 60_000 : 20_000;
  const ms = base * Math.pow(2, Math.min(attempts, 6));
  const jitter = Math.floor(Math.random() * 15_000);
  return ms + jitter;
}

async function rpc(sb: any, fn: string, args: any = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
}

async function pullDueJobs(sb: any, limit: number): Promise<Job[]> {
  const { data, error } = await sb
    .from("enrichment_jobs")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("pullDueJobs error", error);
    return [];
  }

  if (data?.length) {
    const ids = data.map((j: any) => j.id);
    await sb
      .from("enrichment_jobs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .in("id", ids);
  }

  return (data ?? []) as Job[];
}

async function bump(sb: any, job: Job, status: string, nextRunAt: Date, reason: string) {
  await sb
    .from("enrichment_jobs")
    .update({
      status,
      next_run_at: nextRunAt.toISOString(),
      updated_at: new Date().toISOString(),
      last_error: reason,
    })
    .eq("id", job.id);
}

async function queueFallback(
  sb: any,
  job: Job,
  reason: string,
  attempts: number
) {
  if (attempts < FALLBACK_THRESHOLD) return;
  if (reason === "not_found") return;

  const { data, error } = await sb
    .from("account_vendor_routing")
    .select("vendor_key, priority")
    .eq("account_id", job.account_id)
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (error) {
    console.error("queueFallback routing error", job.id, error);
    return;
  }

  const ordered = data ?? [];
  if (!ordered.length) return;

  const currentIndex = ordered.findIndex((s: any) => s.vendor_key === job.source);
  if (currentIndex === -1) return;

  const fallback = ordered[currentIndex + 1];
  if (!fallback) return;

  await sb
    .from("enrichment_jobs")
    .upsert(
      {
        account_id: job.account_id,
        lead_id: job.lead_id,
        source: fallback.vendor_key,
        cache_key: job.cache_key,
        status: "pending",
        next_run_at: new Date(Date.now() + 30_000).toISOString(),
      },
      { onConflict: "lead_id,source,cache_key" }
    )
    .catch((err: any) => console.error("queueFallback upsert error", job.id, err));

  await rpc(sb, "set_account", { p_account_id: job.account_id }).catch(() => {});
  await rpc(sb, "log_event", {
    p_kind: "enrich_job",
    p_status: "error",
    p_latency_ms: null,
    p_count_int: null,
    p_ref_id: job.id,
    p_message: `fallback_${reason}`,
    p_context: { source: job.source, fallback: fallback.vendor_key, attempts },
  }).catch((err: any) => console.error("log_event fallback error", job.id, err));
}

async function processJob(sb: any, job: Job) {
  const started = Date.now();
  try {
    const qok = await rpc(sb, "try_consume_quota", { p_source: job.source, p_units: 1 }).catch((err: any) => {
      console.error("try_consume_quota error", job.id, err);
      return false;
    });

    if (!qok) {
      const delayUntil = new Date(Date.now() + RATE_LIMIT_DELAY_MS);
      await bump(sb, job, "pending", delayUntil, "quota_exhausted");
      return;
    }

    const adapter = getAdapter(job.source);
    if (!adapter) {
      await bump(
        sb,
        job,
        "failed",
        new Date(Date.now() + backoff(job.attempts + 1, false)),
        "adapter_missing",
      );
      await rpc(sb, "set_account", { p_account_id: job.account_id }).catch(() => {});
      await rpc(sb, "log_event", {
        p_kind: "enrich_job",
        p_status: "error",
        p_latency_ms: Date.now() - started,
        p_count_int: null,
        p_ref_id: job.id,
        p_message: "adapter_missing",
        p_context: { source: job.source },
      }).catch((err: any) => console.error("log_event error", job.id, err));
      return;
    }

    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("id, account_id, email, first_name, last_name, company")
      .eq("id", job.lead_id)
      .maybeSingle();

    if (leadErr || !lead) {
      console.error("lead fetch failed", job.id, leadErr);
      await sb
        .from("enrichment_jobs")
        .update({
          status: "failed",
          attempts: job.attempts + 1,
          last_error: "lead_missing",
          next_run_at: new Date(Date.now() + backoff(job.attempts + 1, false)).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      await rpc(sb, "set_account", { p_account_id: job.account_id }).catch(() => {});
      await rpc(sb, "log_event", {
        p_kind: "enrich_job",
        p_status: "error",
        p_latency_ms: Date.now() - started,
        p_count_int: null,
        p_ref_id: job.id,
        p_message: "lead_missing",
        p_context: { source: job.source, attempts: job.attempts + 1 },
      }).catch((err: any) => console.error("log_event error", job.id, err));
      return;
    }

    const secrets = await loadVendorSecrets(lead.account_id, job.source, sb).catch(() => ({}));
    const res = await adapter
      .enrich(lead, secrets)
      .catch((err: any) => ({ status: "error" as const, message: String(err?.message ?? err ?? "") }));

    if (res.status === "ok" || res.status === "not_found") {
      await sb.rpc("add_enrichment_cache", {
        p_lead: lead.id,
        p_account: lead.account_id,
        p_source: job.source,
        p_status: res.status,
        p_data: res.data ?? {},
        p_cache_key: job.cache_key,
        p_ttl: res.status === "ok" ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 2,
      });

      await sb
        .from("enrichment_jobs")
        .update({
          status: "succeeded",
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", job.id);

      await rpc(sb, "set_account", { p_account_id: job.account_id }).catch(() => {});
      await rpc(sb, "log_event", {
        p_kind: "enrich_job",
        p_status: "ok",
        p_latency_ms: Date.now() - started,
        p_count_int: 1,
        p_ref_id: job.id,
        p_message: null,
        p_context: { source: job.source },
      }).catch((err: any) => console.error("log_event error", job.id, err));
      return;
    }

    const attempts = job.attempts + 1;
    const nextDelay = backoff(attempts, res.status === "rate_limited");
    const exhausted = attempts >= job.max_attempts;
    const nextRun = exhausted
      ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      : new Date(Date.now() + nextDelay);

    const updatePromise = sb
      .from("enrichment_jobs")
      .update({
        status: "failed",
        attempts,
        last_error: res.status,
        next_run_at: nextRun.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await Promise.all([
      updatePromise,
      queueFallback(sb, job, res.status, attempts).catch((err) =>
        console.error("queueFallback error", job.id, err)
      ),
    ]);

    await rpc(sb, "set_account", { p_account_id: job.account_id }).catch(() => {});
    await rpc(sb, "log_event", {
      p_kind: "enrich_job",
      p_status: "error",
      p_latency_ms: Date.now() - started,
      p_count_int: null,
      p_ref_id: job.id,
      p_message: res.status,
      p_context: { source: job.source, attempts },
    }).catch((err: any) => console.error("log_event error", job.id, err));
  } catch (err) {
    console.error("processJob unexpected error", job.id, err);
    const attempts = job.attempts + 1;
    const updatePromise = sb
      .from("enrichment_jobs")
      .update({
        status: "failed",
        attempts,
        last_error: String(err?.message ?? err ?? "error"),
        next_run_at: new Date(Date.now() + backoff(attempts, false)).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await Promise.all([
      updatePromise,
      queueFallback(sb, job, "unexpected_error", attempts).catch((fallbackErr) =>
        console.error("queueFallback error", job.id, fallbackErr)
      ),
    ]);
    await rpc(sb, "set_account", { p_account_id: job.account_id }).catch(() => {});
    await rpc(sb, "log_event", {
      p_kind: "enrich_job",
      p_status: "error",
      p_latency_ms: Date.now() - started,
      p_count_int: null,
      p_ref_id: job.id,
      p_message: "unexpected_error",
      p_context: { source: job.source, attempts },
    }).catch((logErr: any) => console.error("log_event error", job.id, logErr));
  }
}

Deno.serve(async () => {
  const sb = svc();
  const jobs = await pullDueJobs(sb, BATCH_LIMIT);
  if (!jobs.length) {
    return json({ pulled: 0 });
  }

  const batches = chunk(jobs, CONCURRENCY);
  for (const set of batches) {
    await Promise.all(set.map((job) => processJob(sb, job)));
  }

  return json({ pulled: jobs.length });
});


