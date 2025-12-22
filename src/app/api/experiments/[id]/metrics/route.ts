import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type VariantRow = {
  id: string;
  label: string;
  is_winner: boolean;
};

type MetricRow = {
  variant_id: string;
  sent: number | null;
  replied: number | null;
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 500 }
    );
  }

  const supa = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const { data: variants, error: variantsError } = await supa
      .from("ab_variants")
      .select("id,label,is_winner")
      .eq("experiment_id", params.id);

    if (variantsError) {
      throw variantsError;
    }

    const { data: metrics, error: metricsError } = await supa
      .from("v_ab_metrics")
      .select("*")
      .eq("experiment_id", params.id);

    if (metricsError) {
      throw metricsError;
    }

    const rows = (variants ?? []).map((variant) => {
      const stats = metrics?.find((m: any) => m.variant_id === variant.id) as
        | MetricRow
        | undefined;
      const sent = Number(stats?.sent ?? 0);
      const replied = Number(stats?.replied ?? 0);

      return {
        variant_id: variant.id,
        label: variant.label,
        is_winner: Boolean(variant.is_winner),
        sent,
        replied,
      };
    });

    const probabilities = calcProbabilities(rows);

    const result = rows.map((row) => ({
      ...row,
      rate: row.sent ? row.replied / row.sent : 0,
      prob_best: probabilities[row.variant_id] ?? 0,
    }));

    return NextResponse.json({ ok: true, rows: result });
  } catch (error) {
    console.error("metrics_fetch_failed", error);
    return NextResponse.json(
      { ok: false, error: "metrics_fetch_failed" },
      { status: 500 }
    );
  }
}

function calcProbabilities(rows: Array<{ variant_id: string; sent: number; replied: number }>) {
  if (!rows.length) return {};

  const wins: Record<string, number> = {};
  rows.forEach((row) => (wins[row.variant_id] = 0));

  const trials = 2000;
  for (let t = 0; t < trials; t++) {
    let bestId = rows[0].variant_id;
    let bestScore = -1;

    for (const row of rows) {
      const a = row.replied + 1;
      const b = Math.max(0, row.sent - row.replied) + 1;
      const draw = betaSample(a, b);
      if (draw > bestScore) {
        bestScore = draw;
        bestId = row.variant_id;
      }
    }

    wins[bestId] += 1;
  }

  return Object.fromEntries(
    rows.map((row) => [row.variant_id, wins[row.variant_id] / trials])
  );
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

