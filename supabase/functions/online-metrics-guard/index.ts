import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function postAlert(supabase: any, kind: string, details: any) {
  await supabase.from("ai_alerts_log").insert({ kind, details });
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  await supabase.rpc("refresh_ai_online_metrics");

  const { data: activeRow } = await supabase
    .from("ai_active_models")
    .select("*")
    .eq("eval_set", "reply_classifier")
    .single();

  if (!activeRow) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const { active_model, canary_model, canary_percent } = activeRow;

  if (canary_model && canary_percent > 0) {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: rows } = await supabase
      .from("ai_live_inferences")
      .select("model_version,is_correct,created_at")
      .gte("created_at", since)
      .in("model_version", [active_model, canary_model]);

    const byModel: Record<string, { n: number; correct: number }> = {};
    (rows || []).forEach((r: any) => {
      const mv = r.model_version;
      if (!byModel[mv]) {
        byModel[mv] = { n: 0, correct: 0 };
      }
      byModel[mv].n++;
      if (r.is_correct === true) {
        byModel[mv].correct++;
      }
    });

    const accActive =
      byModel[active_model]?.n
        ? byModel[active_model].correct / byModel[active_model].n
        : null;
    const accCanary =
      byModel[canary_model]?.n
        ? byModel[canary_model].correct / byModel[canary_model].n
        : null;
    const canaryN = byModel[canary_model]?.n || 0;

    if (
      accActive !== null &&
      accCanary !== null &&
      canaryN >= 200 &&
      accActive - accCanary >= 0.05
    ) {
      await supabase
        .from("ai_active_models")
        .update({
          canary_percent: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("eval_set", "reply_classifier");

      await supabase.from("ai_model_promotions").insert({
        eval_set: "reply_classifier",
        to_model: active_model,
        action: "rollback",
        details: {
          reason: "auto-guard: canary underperforming",
          accActive,
          accCanary,
          canaryN,
        },
      });

      await postAlert(supabase, "canary_breach", {
        accActive,
        accCanary,
        canaryN,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
















