// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type VariantStat = {
  campaign_id: string;
  scenario: string;
  tone: string;
  variant_id: string;
  weight: number | null;
  nudges_sent: number | null;
  good_rate_pct: number | null;
};

Deno.serve(async () => {
  const sb = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sb || !key) {
    return new Response(JSON.stringify({ ok: false, error: "missing_env" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const statsRes = await fetch(`${sb}/rest/v1/v_nudge_variant_stats?select=*`, { headers });
  if (!statsRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: "stats_fetch", status: statsRes.status }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }

  const rows: VariantStat[] = await statsRes.json();

  const grouped = new Map<string, VariantStat[]>();
  for (const row of rows) {
    const key = `${row.campaign_id}:${row.scenario}:${row.tone}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const updates: Promise<Response>[] = [];

  for (const [, arr] of grouped) {
    const eligible = arr.filter((row) => (row.nudges_sent ?? 0) >= 5);
    if (eligible.length < 3) continue;
    const sorted = [...eligible].sort((a, b) => (b.good_rate_pct ?? 0) - (a.good_rate_pct ?? 0));

    const quartile = Math.max(1, Math.ceil(sorted.length / 4));
    const top = sorted.slice(0, quartile);
    const bottom = sorted.slice(-quartile);

    for (const row of top) {
      const nextWeight = Math.min(5, (row.weight ?? 1) + 0.5);
      updates.push(
        fetch(`${sb}/rest/v1/nudge_variants?id=eq.${row.variant_id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify([{ weight: nextWeight }]),
        }),
      );
    }

    for (const row of bottom) {
      const nextWeight = Math.max(0.2, (row.weight ?? 1) - 0.3);
      updates.push(
        fetch(`${sb}/rest/v1/nudge_variants?id=eq.${row.variant_id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify([{ weight: nextWeight }]),
        }),
      );
    }
  }

  const results = await Promise.all(updates);
  const failed = results.filter((res) => !res.ok);

  if (failed.length) {
    return new Response(
      JSON.stringify({ ok: false, updated: updates.length - failed.length, failed: failed.length }),
      { headers: { "Content-Type": "application/json" }, status: 500 },
    );
  }

  return new Response(JSON.stringify({ ok: true, updated: updates.length }), {
    headers: { "Content-Type": "application/json" },
  });
});

