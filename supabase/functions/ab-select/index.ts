import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Objective = "reply" | "open" | "click";

type VariantRow = {
  id: string;
  label: string;
};

type VariantMetric = {
  variant_id: string;
  sent: number | null;
  opened: number | null;
  clicked: number | null;
  replied: number | null;
};

type VariantExposure = {
  variant_id: string;
  count: number;
};

Deno.serve(async (req) => {
  const supa = createClient(url, key);

  try {
    const { account_id, experiment_id, lead_id } = await req.json();

    if (!account_id || !experiment_id || !lead_id) {
      return json({ ok: false, error: "missing_fields" }, 400);
    }

    // Check for an existing assignment to keep the variant sticky per lead
    const { data: existingAssignment } = await supa
      .from("ab_assignments")
      .select("variant_id")
      .eq("account_id", account_id)
      .eq("experiment_id", experiment_id)
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (existingAssignment?.variant_id) {
      return json({ ok: true, variant_id: existingAssignment.variant_id, reused: true });
    }

    const { data: exp, error: expErr } = await supa
      .from("ab_experiments")
      .select("*")
      .eq("id", experiment_id)
      .eq("account_id", account_id)
      .single();

    if (expErr || !exp || exp.status !== "active") {
      return json({ ok: false, error: "inactive_experiment" }, 400);
    }

    const { data: variants, error: varErr } = await supa
      .from("ab_variants")
      .select("id,label")
      .eq("experiment_id", experiment_id)
      .order("created_at");

    if (varErr || !variants?.length) {
      return json({ ok: false, error: "no_variants" }, 400);
    }

    const { data: metrics } = await supa
      .from("v_ab_metrics")
      .select("*")
      .eq("experiment_id", experiment_id);

    const { data: exposures } = await supa
      .from("ab_assignments")
      .select("variant_id, count:variant_id", { group: "variant_id" })
      .eq("experiment_id", experiment_id)
      .eq("account_id", account_id);

    const chosen = chooseVariant({
      variants,
      metrics: metrics as VariantMetric[] | null,
      exposures: exposures as VariantExposure[] | null,
      objective: exp.objective as Objective,
      exploreFloor: Number(exp.explore_floor ?? 0),
    });

    const insertPayload = {
      account_id,
      experiment_id,
      variant_id: chosen.variant_id,
      lead_id,
    };

    try {
      await supa.from("ab_assignments").insert(insertPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("duplicate key value")) {
        throw error;
      }
    }

    return json({
      ok: true,
      variant_id: chosen.variant_id,
      label: chosen.label,
      debug: chosen.debug,
    });
  } catch (error) {
    return json({ ok: false, error: String(error) }, 500);
  }
});

function chooseVariant(args: {
  variants: VariantRow[];
  metrics: VariantMetric[] | null;
  exposures: VariantExposure[] | null;
  objective: Objective;
  exploreFloor: number;
}): { variant_id: string; label: string; debug: Record<string, unknown> } {
  const { variants, metrics, exposures, objective, exploreFloor } = args;

  const metricMap = new Map<string, VariantMetric>();
  metrics?.forEach((m) => metricMap.set(m.variant_id, m));

  const exposureMap = new Map<string, number>();
  variants.forEach((v) => exposureMap.set(v.id, 0));
  exposures?.forEach((row) => {
    exposureMap.set(row.variant_id, Number(row.count ?? 0));
  });

  const draws: Array<{
    variant_id: string;
    label: string;
    score: number;
    sent: number;
    success: number;
    exposure: number;
  }> = [];

  let totalSent = 0;
  for (const v of variants) {
    const m = metricMap.get(v.id);
    const sent = Number(m?.sent ?? 0);
    const success =
      objective === "reply"
        ? Number(m?.replied ?? 0)
        : objective === "click"
        ? Number(m?.clicked ?? 0)
        : Number(m?.opened ?? 0);

    totalSent += sent;
    const exposureCount = exposureMap.get(v.id) ?? 0;
    const a = success + 1;
    const b = Math.max(0, sent - success) + 1;
    const score = betaSample(a, b);
    draws.push({
      variant_id: v.id,
      label: v.label,
      score,
      sent,
      success,
      exposure: exposureCount,
    });
  }

  const totalExposure = draws.reduce((sum, d) => sum + d.exposure, 0);
  const floor = isFinite(exploreFloor) ? Math.max(0, exploreFloor) : 0;

  let chosen = draws[0];

  if (totalExposure === 0 || floor === 0) {
    draws.sort((a, b) => b.score - a.score);
    chosen = draws[0];
  } else {
    const underFloor = draws.filter((d) => {
      const share = totalExposure > 0 ? d.exposure / totalExposure : 0;
      return share < floor;
    });

    if (underFloor.length > 0) {
      const idx = Math.floor(random() * underFloor.length);
      chosen = underFloor[idx];
    } else {
      draws.sort((a, b) => b.score - a.score);
      chosen = draws[0];
    }
  }

  return {
    variant_id: chosen.variant_id,
    label: chosen.label,
    debug: {
      draws,
      totalSent,
      totalExposure,
      floor,
    },
  };
}

function betaSample(a: number, b: number) {
  const x = gamma(a);
  const y = gamma(b);
  return x / (x + y);
}

function gamma(k: number) {
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

