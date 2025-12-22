import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVAL_SET = "reply_classifier";
const MIN_N = 1_000;
const MIN_DELTA = 0.0;

function getEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

serve(async () => {
  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: activeRow, error: activeError } = await supabase
      .from("ai_active_models")
      .select("*")
      .eq("eval_set", EVAL_SET)
      .maybeSingle();
    if (activeError) throw activeError;

    if (!activeRow?.canary_model || (activeRow.canary_percent ?? 0) <= 0) {
      return new Response(JSON.stringify({ ok: true, reason: "no_canary" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const activeModel = activeRow.active_model;
    const canaryModel = activeRow.canary_model;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error: rowsError } = await supabase
      .from("ai_live_inferences")
      .select("model_version,is_correct")
      .gte("created_at", since)
      .in("model_version", [activeModel, canaryModel]);
    if (rowsError) throw rowsError;

    const agg: Record<string, { n: number; c: number }> = {};
    for (const r of rows ?? []) {
      const version = (r as any).model_version as string | null;
      if (!version) continue;
      agg[version] ??= { n: 0, c: 0 };
      agg[version].n += 1;
      if ((r as any).is_correct === true) agg[version].c += 1;
    }

    const aStats = agg[activeModel] ?? { n: 0, c: 0 };
    const cStats = agg[canaryModel] ?? { n: 0, c: 0 };
    const aN = aStats.n;
    const cN = cStats.n;
    const aA = aN ? aStats.c / aN : null;
    const cA = cN ? cStats.c / cN : null;

    if (cN >= MIN_N && aA !== null && cA !== null && cA - aA >= MIN_DELTA) {
      await supabase
        .from("ai_active_models")
        .update({
          active_model: canaryModel,
          canary_model: null,
          canary_percent: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("eval_set", EVAL_SET);

      if (canaryModel) {
        await supabase.from("ai_model_registry").update({ status: "active" }).eq("model_version", canaryModel);
      }
      if (activeModel) {
        await supabase
          .from("ai_model_registry")
          .update({ status: "archived" })
          .eq("model_version", activeModel);
      }

      await supabase.from("ai_model_promotions").insert({
        eval_set: EVAL_SET,
        from_model: activeModel,
        to_model: canaryModel,
        action: "promote",
        details: { mode: "auto", aN, aA, cN, cA },
      });

      await supabase.from("ai_alerts_log").insert({
        kind: "info",
        details: { msg: "auto-promoted canary", activeModel, canaryModel, aN, aA, cN, cA },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, activeModel, canaryModel, aN, aA, cN, cA }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  } catch (error) {
    console.error("canary-promoter error", error);
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
















