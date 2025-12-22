// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function handle(job: any) {
  const type = job.type as string;
  if (type === "ai_classify_inbound") {
    const message_id = job.payload?.message_id;
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-classify-inbound`, {
      method: "POST",
      headers: { 
        "content-type": "application/json", 
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` 
      },
      body: JSON.stringify({ message_id })
    });
  } else if (type === "sms_intent_classify") {
    const message_id = job.payload?.message_id;
    if (message_id) {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sms-intent-classify`, {
        method: "POST",
        headers: { 
          "content-type": "application/json", 
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` 
        },
        body: JSON.stringify({ message_id })
      });
    }
  } else if (type === "send_broadcast") {
    const broadcast_id = job.payload?.broadcast_id;
    if (broadcast_id) {
      // Prepare and queue broadcast emails
      await sb.rpc("prepare_broadcast_send", { p_broadcast_id: broadcast_id });
      await sb.rpc("queue_broadcast_emails", { 
        p_broadcast_id: broadcast_id,
        p_batch_size: 100 
      });
    }
  }
}

Deno.serve(async () => {
  const processed = await runJobs();
  const rewrites = await runRewriteQueue();

  return new Response(
    JSON.stringify({ ok: true, processed, rewrites }),
    { headers: { "content-type": "application/json" } }
  );
});

async function runJobs() {
  const { data: jobs } = await sb.from("jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(10);

  for (const j of jobs ?? []) {
    await sb.from("jobs").update({ status: "running" }).eq("id", j.id);
    try {
      await handle(j);
      await sb.from("jobs").update({ status: "done" }).eq("id", j.id);
    } catch {
      await sb.from("jobs").update({ status: "error" }).eq("id", j.id);
    }
  }

  return jobs?.length ?? 0;
}

async function runRewriteQueue() {
  const { data: queued } = await sb
    .from("template_rewrite_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(5);

  let processed = 0;
  for (const job of queued ?? []) {
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/template-rewrite`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify({ job_id: job.id })
      }
    );

    if (res.ok) processed += 1;
  }

  return processed;
}


