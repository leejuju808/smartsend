// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL");
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SB_URL || !SRK) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
}

const N_MIN = 40;
const FLOOR = 0.05;
const SAMPLES = 2000;

function randomNormal(): number {
  const u = Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function randomGamma(shape: number): number {
  if (shape <= 0) {
    throw new Error("Shape parameter must be positive for Gamma distribution");
  }

  if (shape < 1) {
    const u = Math.random();
    return randomGamma(1 + shape) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    const x = randomNormal();
    let v = 1 + c * x;
    if (v <= 0) {
      continue;
    }

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const x = randomGamma(alpha);
  const y = randomGamma(beta);
  return x / (x + y);
}

function toNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function almostEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}

Deno.serve(async (_req) => {
  const sb = createClient(SB_URL, SRK);

  const init = await sb.rpc("init_variant_optimizer");
  if (init.error) {
    return respondError(500, init.error.message);
  }

  const { data: rows, error } = await sb
    .from("v_variant_overview")
    .select(
      "variant_id,campaign_id,step_no,name,weight,sends,replies,a,b,locked"
    );

  if (error) {
    return respondError(500, error.message);
  }

  const byStep = new Map<string, any[]>();
  for (const row of rows || []) {
    if (!row.variant_id || !row.campaign_id || row.step_no === null) {
      continue;
    }
    const key = `${row.campaign_id}:${row.step_no}`;
    if (!byStep.has(key)) {
      byStep.set(key, []);
    }
    byStep.get(key)!.push(row);
  }

  const now = new Date().toISOString();

  for (const variants of byStep.values()) {
    if (!variants.length) continue;

    const totalSends = variants.reduce((sum, v) => sum + toNumber(v.sends, 0), 0);
    const locked = variants.filter((v) => v.locked === true);
    const unlocked = variants.filter((v) => !v.locked);

    const lockedWeight = locked.reduce((sum, v) => sum + toNumber(v.weight, 0), 0);
    const leftover = Math.max(0, 1 - lockedWeight);

    if (variants.length < 2 || unlocked.length === 0 || leftover <= 0) {
      await Promise.all(
        variants.map((v) => {
          const replies = toNumber(v.replies, 0);
          const sends = toNumber(v.sends, 0);
          const nextA = toNumber(v.a, 1) + replies;
          const nextB = toNumber(v.b, 1) + Math.max(sends - replies, 0);
          return sb
            .from("variant_optimizer")
            .update({
              a: nextA,
              b: nextB,
              last_weight: toNumber(v.weight, 0),
              last_eval_at: now,
            })
            .eq("variant_id", v.variant_id);
        })
      );
      continue;
    }

    if (totalSends < N_MIN) {
      const equalWeight = leftover / unlocked.length;
      await Promise.all(
        unlocked.map(async (v) => {
          const replies = toNumber(v.replies, 0);
          const sends = toNumber(v.sends, 0);
          const nextA = toNumber(v.a, 1) + replies;
          const nextB = toNumber(v.b, 1) + Math.max(sends - replies, 0);

          if (!almostEqual(toNumber(v.weight, 0), equalWeight)) {
            await sb
              .from("campaign_step_variants")
              .update({ weight: equalWeight })
              .eq("id", v.variant_id);
          }

          await sb
            .from("variant_optimizer")
            .update({
              a: nextA,
              b: nextB,
              last_weight: equalWeight,
              last_eval_at: now,
            })
            .eq("variant_id", v.variant_id);
        })
      );

      await Promise.all(
        locked.map((v) => {
          const replies = toNumber(v.replies, 0);
          const sends = toNumber(v.sends, 0);
          const nextA = toNumber(v.a, 1) + replies;
          const nextB = toNumber(v.b, 1) + Math.max(sends - replies, 0);
          return sb
            .from("variant_optimizer")
            .update({
              a: nextA,
              b: nextB,
              last_weight: toNumber(v.weight, 0),
              last_eval_at: now,
            })
            .eq("variant_id", v.variant_id);
        })
      );

      continue;
    }

    const wins: Record<string, number> = {};
    for (const v of unlocked) {
      wins[v.variant_id] = 0;
    }

    for (let i = 0; i < SAMPLES; i++) {
      let bestId: string | null = null;
      let bestTheta = -Infinity;

      for (const v of unlocked) {
        const replies = toNumber(v.replies, 0);
        const sends = toNumber(v.sends, 0);
        const alpha = toNumber(v.a, 1) + replies;
        const beta = toNumber(v.b, 1) + Math.max(sends - replies, 0);
        const theta = sampleBeta(alpha, beta);

        if (theta > bestTheta) {
          bestTheta = theta;
          bestId = v.variant_id;
        }
      }

      if (bestId) {
        wins[bestId] += 1;
      }
    }

    let rawSum = 0;
    const rawWeights: Record<string, number> = {};
    for (const v of unlocked) {
      const weight = wins[v.variant_id] / SAMPLES;
      rawWeights[v.variant_id] = weight;
      rawSum += weight;
    }

    if (rawSum <= 0) {
      rawSum = unlocked.length;
      for (const v of unlocked) {
        rawWeights[v.variant_id] = 1 / unlocked.length;
      }
    }

    const floorEach = Math.min(FLOOR, unlocked.length ? leftover / unlocked.length : 0);
    let remaining = Math.max(0, leftover - floorEach * unlocked.length);

    const updates: Array<Promise<any>> = [];

    for (const v of unlocked) {
      const replies = toNumber(v.replies, 0);
      const sends = toNumber(v.sends, 0);
      const nextA = toNumber(v.a, 1) + replies;
      const nextB = toNumber(v.b, 1) + Math.max(sends - replies, 0);

      const share = rawWeights[v.variant_id] / rawSum;
      const weight = floorEach + remaining * share;
      const boundedWeight = Math.min(1, Math.max(0, weight));

      if (!almostEqual(toNumber(v.weight, 0), boundedWeight)) {
        updates.push(
          sb.from("campaign_step_variants").update({ weight: boundedWeight }).eq("id", v.variant_id)
        );
      }

      updates.push(
        sb
          .from("variant_optimizer")
          .update({
            a: nextA,
            b: nextB,
            last_weight: boundedWeight,
            last_eval_at: now,
          })
          .eq("variant_id", v.variant_id)
      );
    }

    for (const v of locked) {
      const replies = toNumber(v.replies, 0);
      const sends = toNumber(v.sends, 0);
      const nextA = toNumber(v.a, 1) + replies;
      const nextB = toNumber(v.b, 1) + Math.max(sends - replies, 0);
      updates.push(
        sb
          .from("variant_optimizer")
          .update({
            a: nextA,
            b: nextB,
            last_weight: toNumber(v.weight, 0),
            last_eval_at: now,
          })
          .eq("variant_id", v.variant_id)
      );
    }

    await Promise.all(updates);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function respondError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}











