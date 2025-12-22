import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.1";

type SendRow = {
  id: string;
  campaign_id: string;
  lead_id: string;
  to_email: string;
  subject: string;
  body: string | null;
  sender_email: string;
  attempts: number;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

function isTransient(err: string) {
  return /timeout|rate|quota|temporar|4\d\d|5\d\d|reset/i.test(err);
}

function jitterSeconds() {
  const base = 60;
  const rand = Math.floor(Math.random() * 300) - 150;
  return base + rand;
}

async function getSenderBudgets() {
  const { data, error } = await supabase.from("sender_concurrency").select("*");
  if (error) {
    console.warn("sender_concurrency fetch error", error);
    return new Map<string, { max_parallel: number; per_minute_cap: number }>();
  }

  const map = new Map<string, { max_parallel: number; per_minute_cap: number }>();
  for (const row of data ?? []) {
    if (!row?.email_from) continue;
    map.set(String(row.email_from).toLowerCase(), {
      max_parallel: Number(row.max_parallel ?? 3),
      per_minute_cap: Number(row.per_minute_cap ?? 30),
    });
  }
  return map;
}

async function sendsInLastMinute(sender: string) {
  const { count, error } = await supabase
    .from("send_logs")
    .select("id", { count: "exact", head: true })
    .eq("sender_email", sender.toLowerCase())
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());

  if (error) {
    console.warn("send_logs count error", error);
    return 0;
  }
  return count ?? 0;
}

serve(async () => {
  const now = new Date();
  const leaseToken = uuidv4();

  const { data: senders, error: sendersError } = await supabase
    .from("send_queue")
    .select("sender_email")
    .eq("status", "queued")
    .lte("due_at", now.toISOString())
    .order("due_at", { ascending: true });

  if (sendersError) {
    console.error("scan queued senders error", sendersError);
    return new Response(JSON.stringify({ ok: false, error: sendersError.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const uniq = Array.from(
    new Set((senders ?? []).map((s: any) => (s?.sender_email ?? "").toLowerCase()))
  ).filter(Boolean);

  if (!uniq.length) {
    return new Response(JSON.stringify({ ok: true, leased: 0, senders: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const budgets = await getSenderBudgets();
  let totalLeased = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let totalBlocked = 0;
  let totalSkipped = 0;

  for (const sender of uniq) {
    const budget = budgets.get(sender) ?? { max_parallel: 3, per_minute_cap: 30 };

    const perMinute = await sendsInLastMinute(sender);
    if (perMinute >= budget.per_minute_cap) {
      totalSkipped++;
      continue;
    }

    const { data: leased, error: leaseError } = await supabase.rpc(
      "lease_sends_for_sender",
      {
        p_sender: sender,
        p_now: now.toISOString(),
        p_limit: budget.max_parallel,
        p_token: leaseToken,
      }
    );

    if (leaseError) {
      console.error("lease_sends_for_sender error", sender, leaseError);
      continue;
    }

    const rows: SendRow[] = (leased ?? []).map((row: any) => ({
      id: row.id,
      campaign_id: row.campaign_id,
      lead_id: row.lead_id,
      to_email: row.to_email,
      subject: row.subject,
      body: row.body ?? row.body_html ?? row.payload?.body ?? null,
      sender_email: row.sender_email,
      attempts: row.attempts ?? 0,
    }));

    totalLeased += rows.length;
    if (!rows.length) continue;

    await Promise.all(
      rows.map(async (row) => {
        try {
          const splay = jitterSeconds();
          if (splay > 0) {
            await new Promise((resolve) => setTimeout(resolve, splay * 10));
          }

          const { data: gate, error: gateError } = await supabase.rpc("preflight_check", {
            p_campaign_id: row.campaign_id,
            p_account_id: null,
            p_lead_id: row.lead_id,
            p_to: row.to_email,
            p_sender_email: row.sender_email,
            p_idem_key: row.id,
          });

          if (gateError) {
            console.warn("preflight_check error", row.id, gateError);
          }

          if (gate && gate.ok === false) {
            totalBlocked++;
            await supabase.from("send_logs").insert({
              queue_id: row.id,
              campaign_id: row.campaign_id,
              lead_id: row.lead_id,
              to_email: row.to_email,
              subject: row.subject,
              body: row.body,
              status: "blocked",
              reason: gate.error ?? "preflight-block",
              meta: gate.meta ?? null,
              sender_email: row.sender_email,
            });

            await supabase.rpc("mark_send_failure", {
              p_id: row.id,
              p_err: `preflight:${gate.error ?? "blocked"}`,
              p_now: new Date().toISOString(),
              p_retry: false,
              p_backoff_seconds: 0,
            });
            return;
          }

          const res = await sendViaProvider(row);
          if (res.ok) {
            totalSent++;
            await supabase.from("send_logs").insert({
              queue_id: row.id,
              campaign_id: row.campaign_id,
              lead_id: row.lead_id,
              to_email: row.to_email,
              subject: row.subject,
              body: row.body,
              status: "sent",
              reason: "provider-accepted",
              meta: res.providerId ? { provider_id: res.providerId } : null,
              sender_email: row.sender_email,
            });
            await supabase.rpc("mark_send_success", { p_id: row.id });
          } else {
            totalFailed++;
            const transient = isTransient(res.error ?? "");
            await supabase.from("send_logs").insert({
              queue_id: row.id,
              campaign_id: row.campaign_id,
              lead_id: row.lead_id,
              to_email: row.to_email,
              subject: row.subject,
              body: row.body,
              status: transient ? "retry" : "failed",
              reason: res.error ?? "unknown",
              meta: res.meta ?? null,
              sender_email: row.sender_email,
            });

            const backoffSec = Math.min(
              3600,
              Math.pow(2, Math.max(1, row.attempts ?? 0)) * 60
            );

            await supabase.rpc("mark_send_failure", {
              p_id: row.id,
              p_err: res.error ?? "send-failed",
              p_now: new Date().toISOString(),
              p_retry: transient,
              p_backoff_seconds: backoffSec,
            });
          }
        } catch (err) {
          totalFailed++;
          const reason = `worker-exception:${String(err)}`;
          await supabase.from("send_logs").insert({
            queue_id: row.id,
            campaign_id: row.campaign_id,
            lead_id: row.lead_id,
            to_email: row.to_email,
            subject: row.subject,
            body: row.body,
            status: "failed",
            reason,
            meta: { error: String(err) },
            sender_email: row.sender_email,
          });

          await supabase.rpc("mark_send_failure", {
            p_id: row.id,
            p_err: reason,
            p_now: new Date().toISOString(),
            p_retry: true,
            p_backoff_seconds: 300,
          });
        }
      })
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      senders: uniq.length,
      leased: totalLeased,
      sent: totalSent,
      failed: totalFailed,
      blocked: totalBlocked,
      skipped: totalSkipped,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
});

async function sendViaProvider(
  row: SendRow
): Promise<{ ok: boolean; providerId?: string; error?: string; meta?: Record<string, unknown> }> {
  try {
    return { ok: true, providerId: `stub:${crypto.randomUUID()}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}






