import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SECRET = Deno.env.get("QUEUE_SECRET")!;

// Helpers
function jitter(ms: number) {
  // ±20% jitter
  const delta = ms * 0.2;
  return Math.round(ms + (Math.random() * 2 - 1) * delta);
}

async function getPlanSettings(team_id: string) {
  const { data: plan } = await supabase
    .from("v_team_plan")
    .select("max_attempts, backoff_base_seconds")
    .eq("team_id", team_id)
    .single();
  return {
    maxAttempts: plan?.max_attempts ?? 5,
    base: (plan?.backoff_base_seconds ?? 120) * 1000
  };
}

function nextBackoffMillis(base: number, attempt: number) {
  // attempt is 1-based after a failure
  const exp = Math.min(6, attempt - 1); // cap growth
  const raw = base * Math.pow(2, exp);  // 2^n
  return Math.min(6 * 60 * 60 * 1000, jitter(raw)); // cap at 6h
}

async function pullDue(limit = 10) {
  // Use atomic RPC function with SKIP LOCKED
  const { data, error } = await supabase.rpc("claim_due_queue", { max_rows: limit });
  if (error) throw error;
  return data ?? [];
}

async function markSent(queueId: string, providerId: string | null) {
  const { data, error } = await supabase
    .from("send_queue")
    .update({ 
      status: "sent", 
      fail_code: null, 
      fail_kind: null, 
      next_attempt_at: null 
    })
    .eq("id", queueId)
    .select("*")
    .single();
  if (error) throw error;

  await supabase.from("send_logs").insert({
    user_id: data.user_id,
    campaign_id: data.campaign_id,
    lead_id: data.lead_id,
    queue_id: queueId,
    provider_id: providerId
  });
}

async function markFailure(row: any, code: string, kind: "transient" | "permanent", msg: string) {
  // fetch team_id via campaign (denormalize team_id into send_queue later for speed)
  const { data: camp } = await supabase
    .from("campaigns")
    .select("team_id")
    .eq("id", row.campaign_id)
    .single();
  
  const { maxAttempts, base } = await getPlanSettings(camp!.team_id);

  const attempts = (row.attempts ?? 0) + 1;

  if (kind === "permanent" || attempts >= maxAttempts) {
    // dead-letter
    await supabase.from("send_queue").update({
      status: "failed",
      attempts,
      fail_code: code,
      fail_kind: kind,
      last_error: msg,
      next_attempt_at: null
    }).eq("id", row.id);

    await supabase.from("dead_letters").insert({
      queue_id: row.id,
      campaign_id: row.campaign_id,
      lead_id: row.lead_id,
      user_id: row.user_id,
      reason: `${code}: ${msg}`.slice(0, 500)
    });
    return;
  }

  const waitMs = nextBackoffMillis(base, attempts);
  const nextAt = new Date(Date.now() + waitMs).toISOString();

  await supabase.from("send_queue").update({
    status: "queued",
    attempts,
    fail_code: code,
    fail_kind: kind,
    last_error: msg,
    next_attempt_at: nextAt
  }).eq("id", row.id);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-ss-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const op = url.searchParams.get("op") ?? "pull";
  try {
    if (op === "pull") {
      const limit = Number(url.searchParams.get("limit") ?? "10");
      const rows = await pullDue(limit);
      return new Response(JSON.stringify({ rows }), { headers: { "Content-Type": "application/json" } });
    }
    if (op === "sent") {
      const body = await req.json(); // { queueId, providerId }
      await markSent(body.queueId, body.providerId ?? null);
      return new Response(JSON.stringify({ ok: true }));
    }
    if (op === "failed") {
      const body = await req.json(); // { queueId, error, code, kind }
      const { data: row } = await supabase
        .from("send_queue")
        .select("*")
        .eq("id", body.queueId)
        .single();
      if (!row) {
        return new Response(JSON.stringify({ error: "queue item not found" }), { status: 404 });
      }
      await markFailure(
        row,
        body.code ?? "unknown",
        body.kind === "permanent" ? "permanent" : "transient",
        body.error ?? "unknown"
      );
      return new Response(JSON.stringify({ ok: true }));
    }
    return new Response("unknown op", { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
