import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return respond({ ok: false, error: "method_not_allowed" }, 405);
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return respond({ ok: false, error: "invalid_json" }, 400);
  }

  const { bundle_id, challenger_version_tag, baseline_version_tag } = payload;
  if (!bundle_id || !challenger_version_tag) {
    return respond({ ok: false, error: "missing_fields" }, 400);
  }

  const s = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      global: {
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
      },
    },
  );

  const { data: run, error: createErr } = await s.from("ai_regression_runs").insert({
    bundle_id,
    challenger_version_tag,
    baseline_version_tag,
    status: "running",
  }).select("*").single();

  if (createErr) {
    return respond({ ok: false, error: createErr.message }, 500);
  }

  const { data: bundle, error: bundleErr } = await s
    .from("ai_regression_bundles")
    .select("*")
    .eq("id", bundle_id)
    .maybeSingle();

  if (bundleErr) {
    await markFailed(s, run.id, bundleErr.message);
    return respond({ ok: false, error: bundleErr.message }, 500);
  }

  const evalSetIds: string[] = bundle?.eval_set_ids ?? [];

  const challengerModelId = await resolveModelId(s, challenger_version_tag);
  if (!challengerModelId) {
    await markFailed(s, run.id, `Unknown challenger version ${challenger_version_tag}`);
    return respond({ ok: false, error: "unknown_challenger" }, 400);
  }

  for (const es of evalSetIds) {

    const { count, error } = await s
      .from("ai_eval_results")
      .select("id", { count: "exact", head: true })
      .eq("eval_set_id", es)
      .eq("model_version_id", challengerModelId);

    if (error) {
      await markFailed(s, run.id, error.message);
      return respond({ ok: false, error: error.message }, 500);
    }

    if (!count || count === 0) {
      await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/eval-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({
          eval_set_id: es,
          model_version_tag: challenger_version_tag,
          concurrency: 6,
        }),
      });
    }
  }

  const summary: any = { per_label: {}, failures: [] as any[] };

  const { data: thr, error: thrErr } = await s
    .from("ai_label_thresholds")
    .select("*")
    .eq("model_name", "replies-cls");

  if (thrErr) {
    await markFailed(s, run.id, thrErr.message);
    return respond({ ok: false, error: thrErr.message }, 500);
  }

  for (const es of evalSetIds) {
    const perLabel = await metricsFor(s, es, challenger_version_tag);

    for (const m of perLabel) {
      const t = thr?.find((x: any) => x.label === m.label);
      if (!summary.per_label[m.label]) summary.per_label[m.label] = [];
      summary.per_label[m.label].push({
        eval_set_id: es,
        precision: m.precision,
        recall: m.recall,
        f1: m.f1,
      });

      if (t) {
        if (m.precision < Number(t.min_precision) || m.recall < Number(t.min_recall)) {
          summary.failures.push({
            eval_set_id: es,
            label: m.label,
            reason: "threshold",
            precision: m.precision,
            recall: m.recall,
            need: { p: Number(t.min_precision), r: Number(t.min_recall) },
          });
        }
      }
    }

    if (baseline_version_tag) {
      const base = await metricsFor(s, es, baseline_version_tag);
      for (const m of perLabel) {
        const b = base.find((x: any) => x.label === m.label);
        if (b && (b.f1 - m.f1) > 0.015) {
          summary.failures.push({
            eval_set_id: es,
            label: m.label,
            reason: "regression",
            challenger_f1: m.f1,
            baseline_f1: b.f1,
          });
        }
      }
    }
  }

  const passed = summary.failures.length === 0;
  await s.from("ai_regression_runs")
    .update({ status: "complete", passed, summary })
    .eq("id", run.id);

  return respond({ ok: true, run_id: run.id, passed, failures: summary.failures.length });
});

async function resolveModelId(s: any, tag: string) {
  const { data: mv } = await s.from("ai_model_versions").select("id").eq("version_tag", tag).maybeSingle();
  return mv?.id;
}

async function metricsFor(s: any, eval_set_id: string, version_tag: string) {
  const { data, error } = await s
    .from("v_ai_per_label_metrics")
    .select("*")
    .eq("eval_set_id", eval_set_id)
    .eq("version_tag", version_tag);

  if (error) {
    console.error("metricsFor error", { eval_set_id, version_tag, error: error.message });
    return [];
  }

  return data ?? [];
}

async function markFailed(s: any, runId: string, error: string) {
  await s.from("ai_regression_runs")
    .update({ status: "failed", summary: { failures: [{ reason: "internal", error }] }, passed: false })
    .eq("id", runId);
}

function respond(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

