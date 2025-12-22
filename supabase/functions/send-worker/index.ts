// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const INSTANCE = crypto.randomUUID();

type ProviderResult =
  | { ok: true; provider_id: string }
  | { ok: false; code: string; message: string; soft?: boolean };

function domainOf(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

// simple lock with TTL
async function acquire(key: string, ttlSec = 15): Promise<boolean> {
  const until = new Date(Date.now() + ttlSec * 1000).toISOString();
  const { error } = await sb.from("send_locks").insert(
    { key, holder: INSTANCE, until },
    { upsert: true },
  ).select().single();
  if (!error) return true;
  // cleanup expired and retry once
  await sb.from("send_locks").delete().lt("until", new Date().toISOString()).eq(
    "key",
    key,
  );
  const r = await sb.from("send_locks").insert({ key, holder: INSTANCE, until })
    .select().single();
  return !r.error;
}

async function release(key: string) {
  await sb.from("send_locks").delete().eq("key", key);
}

async function policyFor(account_id: string) {
  const { data } = await sb.from("send_orchestrator_policies").select("*").eq(
    "account_id",
    account_id,
  ).maybeSingle();
  return {
    per_sender_concurrency: data?.per_sender_concurrency ?? 2,
    per_domain_concurrency: data?.per_domain_concurrency ?? 4,
    global_concurrency: data?.global_concurrency ?? 20,
    retry_minutes: (data?.retry_minutes ?? [5, 15, 45, 120, 360]) as number[],
  };
}

async function inflightCount(
  scope: "global" | "sender" | "domain",
  val?: string,
) {
  if (scope === "global") {
    const { count } = await sb.from("send_queue").select("*", {
      count: "exact",
      head: true,
    }).eq("state", "inflight");
    return count ?? 0;
  }

  if (scope === "sender") {
    const { count } = await sb.from("send_queue").select("*", {
      count: "exact",
      head: true,
    }).eq("state", "inflight").eq("sender_email", val);
    return count ?? 0;
  }

  if (scope === "domain") {
    const dom = val!;
    const { data } = await sb.rpc("count_inflight_by_domain", { p_domain: dom });
    return (data as number) ?? 0;
  }

  return 0;
}

serve(async (req) => {
  try {
    const { account_id, batch_size = 25 } = await req.json();
    const policy = await policyFor(account_id);

    // 1) Select candidates (ready & queued) ordered by lane, priority, planned_at
    const { data: rows } = await sb
      .from("send_queue")
      .select("*")
      .eq("account_id", account_id)
      .eq("state", "queued")
      .lte("planned_at", new Date().toISOString())
      .order("lane", { ascending: true }) // 'low'>'normal'>'urgent' lexically, so map externally if needed
      .order("priority", { ascending: true })
      .order("planned_at", { ascending: true })
      .limit(batch_size);

    if (!rows?.length) {
      return new Response(
        JSON.stringify({ ok: true, claimed: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    let claimed = 0;

    for (const q of rows) {
      const sender = (q.sender_email ?? "").toLowerCase();
      if (!sender) continue;
      const dom = domainOf(sender);
      const nowIso = new Date().toISOString();

      const { data: paused } = await sb
        .from("sender_pauses")
        .select("until")
        .in("key", [`sender:${sender}`, `domain:${dom}`])
        .gte("until", nowIso);

      if (paused && paused.length) {
        // Defer this item without claiming it; optional: push planned_at forward slightly
        await sb.from("send_queue")
          .update({
            last_error: "paused_sender",
          })
          .eq("id", q.id)
          .eq("state", "queued");
        continue;
      }

      // Respect concurrency
      const g = await inflightCount("global");
      if (g >= policy.global_concurrency) break;
      const s = await inflightCount("sender", sender);
      if (s >= policy.per_sender_concurrency) continue;
      const d = await inflightCount("domain", dom);
      if (d >= policy.per_domain_concurrency) continue;

      // Acquire locks to serialize send for that sender & domain briefly
      const lkSender = `concur:sender:${sender}`;
      const lkDomain = `concur:domain:${dom}`;
      if (!(await acquire(lkSender))) continue;
      if (!(await acquire(lkDomain))) {
        await release(lkSender);
        continue;
      }

      // Mark inflight idempotently
      const { data: marked, error } = await sb.from("send_queue")
        .update({ state: "inflight" })
        .eq("id", q.id)
        .eq("state", "queued")
        .select("*")
        .single();

      if (error || !marked) {
        await release(lkSender);
        await release(lkDomain);
        continue;
      }
      claimed++;

      // Provider send (replace with your Gmail/Outlook/SMTP call)
      const sent = await sendViaProvider(marked);

      // Handle result
      if (sent.ok) {
        await sb.from("send_events").insert({
          account_id: q.account_id,
          queue_id: q.id,
          lead_id: q.lead_id,
          sender_email: q.sender_email,
          recipient_email: q.recipient_email,
          kind: "sent",
          provider_id: sent.provider_id,
          details: q.meta,
        });
        await sb.from("send_queue").update({
          state: "sent",
          last_error: null,
        }).eq("id", q.id);
      } else {
        const soft = !!sent.soft;
        const tryNext = q.try_count + 1;
        const backoffMin = policy.retry_minutes[
          Math.min(tryNext - 1, policy.retry_minutes.length - 1)
        ];
        const schedule = new Date(
          Date.now() + (soft ? backoffMin : 60) * 60 * 1000,
        ).toISOString();

        await sb.from("send_events").insert({
          account_id: q.account_id,
          queue_id: q.id,
          lead_id: q.lead_id,
          sender_email: q.sender_email,
          recipient_email: q.recipient_email,
          kind: soft
            ? "throttled"
            : (sent.code?.startsWith("5") ? "soft_bounce" : "rejected"),
          details: { code: sent.code, message: sent.message },
        });

        if (soft && tryNext <= q.max_retries) {
          await sb.from("send_queue").update({
            state: "queued",
            try_count: tryNext,
            last_error: sent.code,
            planned_at: schedule,
          }).eq("id", q.id);
        } else {
          await sb.from("send_queue").update({
            state: "failed",
            try_count: tryNext,
            last_error: `${sent.code}:${sent.message}`,
          }).eq("id", q.id);
        }
      }

      await release(lkSender);
      await release(lkDomain);
    }

    return new Response(
      JSON.stringify({ ok: true, claimed }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "SERVER_ERROR", detail: String(e) }),
      { status: 500 },
    );
  }
});

const PROVIDER_SEND_URL = Deno.env.get("PROVIDER_SEND_URL");

/** Call the provider adapter (Gmail / Outlook) */
async function sendViaProvider(q: any): Promise<ProviderResult> {
  if (!PROVIDER_SEND_URL) {
    return {
      ok: false,
      code: "CONFIG",
      message: "PROVIDER_SEND_URL not configured",
    };
  }

  try {
    const res = await fetch(PROVIDER_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: q.account_id,
        sender_email: q.sender_email,
        to: q.recipient_email,
        subject: q.subject,
        html: q.body_html,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        code: data?.code ?? String(res.status),
        message: data?.message ?? data?.error ?? "Provider send failed",
        soft: res.status === 429,
      };
    }

    if (data?.ok) {
      return { ok: true, provider_id: data.provider_id ?? crypto.randomUUID() };
    }

    return {
      ok: false,
      code: data?.code ?? "UNKNOWN",
      message: data?.message ?? "Provider adapter error",
      soft: data?.code === "quota_exceeded" || data?.code === "account_paused",
    };
  } catch (err) {
    return {
      ok: false,
      code: "NETWORK",
      message: err instanceof Error ? err.message : String(err),
      soft: true,
    };
  }
}

