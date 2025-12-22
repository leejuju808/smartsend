import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Objective = "reply" | "open" | "click";

type VariantStat = {
  id: string;
  label: string;
  sent: number;
  success: number;
};

Deno.serve(async () => {
  const supa = createClient(url, key);

  try {
    const { data: exps, error } = await supa
      .from("ab_experiments")
      .select("*")
      .eq("status", "active");

    if (error) throw error;

    for (const exp of exps ?? []) {
      await adjudicateExperiment(supa, exp);
    }

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: String(error) }, 500);
  }
});

async function adjudicateExperiment(
  supa: ReturnType<typeof createClient>,
  exp: any,
) {
  const { data: variants, error: variantsErr } = await supa
    .from("ab_variants")
    .select("id,label,is_winner")
    .eq("experiment_id", exp.id);

  if (variantsErr || !variants?.length) return;

  const { data: metrics, error: metricsErr } = await supa
    .from("v_ab_metrics")
    .select("*")
    .eq("experiment_id", exp.id);

  if (metricsErr) return;

  const stats: VariantStat[] = variants.map((v) => {
    const m = metrics?.find((row: any) => row.variant_id === v.id);
    const sent = Number(m?.sent ?? 0);
    const success =
      exp.objective === "reply"
        ? Number(m?.replied ?? 0)
        : exp.objective === "click"
        ? Number(m?.clicked ?? 0)
        : Number(m?.opened ?? 0);

    return { id: v.id, label: v.label, sent, success };
  });

  const totalSent = stats.reduce((sum, s) => sum + s.sent, 0);
  if (totalSent < Number(exp.min_sample ?? 0)) return;

  const trials = 5000;
  const wins: Record<string, number> = Object.fromEntries(
    stats.map((s) => [s.id, 0]),
  );

  for (let t = 0; t < trials; t++) {
    let bestId = stats[0].id;
    let bestScore = -1;

    for (const stat of stats) {
      const a = stat.success + 1;
      const b = Math.max(0, stat.sent - stat.success) + 1;
      const draw = betaSample(a, b);
      if (draw > bestScore) {
        bestScore = draw;
        bestId = stat.id;
      }
    }

    wins[bestId] += 1;
  }

  const probabilities = stats.map((s) => ({
    variant_id: s.id,
    prob: wins[s.id] / trials,
  }));

  probabilities.sort((a, b) => b.prob - a.prob);
  const top = probabilities[0];
  if (!top) return;

  if (top.prob >= Number(exp.stop_threshold ?? 0.95)) {
    await supa
      .from("ab_variants")
      .update({ is_winner: false })
      .eq("experiment_id", exp.id);

    await supa
      .from("ab_variants")
      .update({ is_winner: true })
      .eq("id", top.variant_id);

    await supa
      .from("ab_experiments")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", exp.id);
  }
}

function betaSample(a: number, b: number) {
  const x = gamma(a);
  const y = gamma(b);
  return x / (x + y);
}

function gamma(k: number): number {
  if (k < 1) {
    const u = random();
    return gamma(1 + k) * Math.pow(u, 1 / k);
  }

  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    const x = normal();
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;

    const u = random();
    if (u < 1 - 0.0331 * Math.pow(x, 4)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function random() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] + 1) / (0xffffffff + 1);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

