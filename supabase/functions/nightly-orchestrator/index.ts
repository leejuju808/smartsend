import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVAL_SET = "reply_classifier";
const CANARY_PERCENT = 10;
const POLL_ATTEMPTS = 10;
const POLL_DELAY_MS = 60_000; // 1 minute

function getEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

async function gateCheck(supabase: any, current: string | null, candidate: string) {
  const { data, error } = await supabase.rpc("check_model_gates", {
    _eval_set: EVAL_SET,
    _current: current,
    _candidate: candidate,
  });
  if (error) throw error;
  return data;
}

async function postAlert(supabase: any, kind: string, details: any) {
  await supabase.from("ai_alerts_log").insert({ kind, details });
}

serve(async () => {
  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const functionsUrl = getEnv("SUPABASE_FUNCTIONS_URL");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 0) Current active model
    const { data: active, error: activeError } = await supabase
      .from("ai_active_models")
      .select("*")
      .eq("eval_set", EVAL_SET)
      .maybeSingle();
    if (activeError) throw activeError;
    const current = active?.active_model ?? null;

    // 1) Target model version
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const target = `replyclf_v${today}`;

    await supabase.rpc("ensure_model_row", { _mv: target }).catch(() => {});

    // 2) Build dataset & queue training
    const datasetRes = await fetch(`${functionsUrl}/dataset-builder`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ target_model_version: target, seed: 42 }),
    });
    if (!datasetRes.ok) {
      await postAlert(supabase, "error", {
        msg: "dataset builder failed",
        status: datasetRes.status,
        target,
      });
      return new Response(JSON.stringify({ ok: false, reason: "dataset_builder_failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    // 3) Find the queued job and dispatch
    const { data: jobs, error: jobsError } = await supabase
      .from("ai_training_jobs")
      .select("id,target_model_version,status")
      .eq("target_model_version", target)
      .order("created_at", { ascending: false })
      .limit(1);
    if (jobsError) throw jobsError;
    const job = jobs?.[0];
    if (!job) {
      await postAlert(supabase, "info", { note: "no training job found", target });
      return new Response(JSON.stringify({ ok: true, message: "no training job found" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const dispatchRes = await fetch(`${functionsUrl}/train-dispatcher`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ job_id: job.id }),
    });
    if (!dispatchRes.ok) {
      await postAlert(supabase, "error", {
        msg: "train dispatcher failed",
        status: dispatchRes.status,
        target,
      });
      return new Response(JSON.stringify({ ok: false, reason: "train_dispatcher_failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    // 4) Poll for completion (light)
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
      const { data: j2, error: pollError } = await supabase
        .from("ai_training_jobs")
        .select("*")
        .eq("id", job.id)
        .maybeSingle();
      if (pollError) throw pollError;
      if (j2?.status === "completed") break;
      if (i === POLL_ATTEMPTS - 1) {
        await postAlert(supabase, "info", {
          note: "training still running after polls",
          target,
          job_id: job.id,
        });
      }
    }

    // 5) Snapshot metrics
    await supabase.rpc("snapshot_eval_metrics", { _model: target, _eval_set: EVAL_SET });

    // 6) Gate check
    const check = await gateCheck(supabase, current, target);
    if (!check?.ok) {
      await postAlert(supabase, "metric_drop", { target, current, check });
      await supabase
        .from("ai_model_registry")
        .update({ status: "failed" })
        .eq("model_version", target);
      return new Response(JSON.stringify({ ok: true, gated: false, check }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // 7) Enable canary
    await supabase
      .from("ai_active_models")
      .update({
        canary_model: target,
        canary_percent: CANARY_PERCENT,
        updated_at: new Date().toISOString(),
      })
      .eq("eval_set", EVAL_SET);

    await supabase.from("ai_model_promotions").insert({
      eval_set: EVAL_SET,
      to_model: target,
      action: "set_canary",
      details: { percent: CANARY_PERCENT, automated: true },
    });

    await postAlert(supabase, "info", { msg: "canary enabled", target, percent: CANARY_PERCENT });

    return new Response(JSON.stringify({ ok: true, target, canary: CANARY_PERCENT }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("nightly-orchestrator error", error);
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
















