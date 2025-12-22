import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function lift(a: any, b: any, metric: string): number {
  const t = Number(a[metric] ?? 0);
  const c = Number(b[metric] ?? 0);
  return t - c; // absolute lift
}

serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: exps } = await sb
    .from("tone_experiments")
    .select("*")
    .eq("status", "running");

  if (!exps || exps.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  let processed = 0;
  let ramped = 0;

  for (const exp of exps) {
    try {
      const { data: perf } = await sb
        .from("tone_experiment_perf_30d")
        .select("*")
        .eq("experiment_id", exp.id);

      const control = perf?.find((p) => p.arm === "control");
      const treatment = perf?.find((p) => p.arm === "treatment");

      if (!control || !treatment) continue;

      const totalSends = Number(control.sends ?? 0) + Number(treatment.sends ?? 0);
      if (totalSends < exp.min_sample) continue;

      const L = lift(treatment, control, exp.primary_metric);
      if (L >= Number(exp.promote_threshold)) {
        // ramp up gradually to max 100
        const nextRamp = Math.min(100, Number(exp.ramp_percent) + 20);
        await sb
          .from("tone_experiments")
          .update({ ramp_percent: nextRamp })
          .eq("id", exp.id);

        ramped++;

        // optional: auto-complete if ramped to 100 and sustained > threshold
        if (nextRamp === 100) {
          await sb
            .from("tone_experiments")
            .update({ status: "completed" })
            .eq("id", exp.id);
        }
      }

      processed++;
    } catch (error) {
      console.error(`Error processing experiment ${exp.id}:`, error);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed, ramped }),
    { headers: { "content-type": "application/json" } },
  );
});















