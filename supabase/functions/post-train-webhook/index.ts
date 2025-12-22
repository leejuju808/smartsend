import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVAL_SET = "reply_classifier";
const CANARY_PERCENT = 10;

function getEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await req.json();
    const modelVersion = body?.model_version as string | undefined;
    if (!modelVersion) {
      return new Response(JSON.stringify({ ok: false, error: "model_version required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    await supabase
      .from("ai_model_registry")
      .update({ status: "pending", metrics: body?.metrics || {} })
      .eq("model_version", modelVersion);

    await supabase.rpc("snapshot_eval_metrics", {
      _model: modelVersion,
      _eval_set: EVAL_SET,
    });

    const { data: active, error: activeError } = await supabase
      .from("ai_active_models")
      .select("*")
      .eq("eval_set", EVAL_SET)
      .maybeSingle();
    if (activeError) throw activeError;
    const current = active?.active_model ?? null;

    const { data: check, error: checkError } = await supabase.rpc("check_model_gates", {
      _eval_set: EVAL_SET,
      _current: current,
      _candidate: modelVersion,
    });
    if (checkError) throw checkError;

    if (!check?.ok) {
      await supabase
        .from("ai_model_registry")
        .update({ status: "failed" })
        .eq("model_version", modelVersion);
      await supabase
        .from("ai_alerts_log")
        .insert({ kind: "metric_drop", details: { model_version: modelVersion, check } });

      return new Response(JSON.stringify({ ok: true, promoted: false, check }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    await supabase
      .from("ai_active_models")
      .update({
        canary_model: modelVersion,
        canary_percent: CANARY_PERCENT,
        updated_at: new Date().toISOString(),
      })
      .eq("eval_set", EVAL_SET);

    await supabase.from("ai_model_promotions").insert({
      eval_set: EVAL_SET,
      to_model: modelVersion,
      action: "set_canary",
      details: { percent: CANARY_PERCENT, webhook: true },
    });

    await supabase
      .from("ai_alerts_log")
      .insert({ kind: "info", details: { msg: "canary enabled via webhook", modelVersion } });

    return new Response(JSON.stringify({ ok: true, canary: CANARY_PERCENT }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("post-train-webhook error", error);
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
















