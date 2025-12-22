import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const lr = 0.25;
const floorWeight = 0.1;
const capWeight = 0.8;
const minSends = 50;
const eps = 1e-6;

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async () => {
  const supa = createClient(supabaseUrl, supabaseKey);

  await supa.rpc("refresh_mv_variant_stats").catch(() => {});

  const { data: stats, error } = await supa.rpc("rpc_variant_stats_30d");
  if (error) {
    return json({ ok: false, error: error.message, updated: 0 });
  }

  if (!stats || stats.length === 0) {
    return json({ ok: true, updated: 0 });
  }

  const groups = new Map<string, any[]>();
  for (const row of stats) {
    const key = `${row.account_id ?? "na"}::${row.preset_key ?? "na"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  let updated = 0;

  for (const [, rows] of groups.entries()) {
    const accountId = rows[0]?.account_id ?? null;
    if (!accountId) continue;

    const sendsTotal = rows.reduce((acc, row) => acc + Number(row.sends || 0), 0);
    if (sendsTotal < minSends) continue;

    const maxReply = Math.max(...rows.map((r) => Number(r.reply_rate || 0)));
    if (maxReply <= 0) continue;

    const denominator = rows.reduce(
      (acc, r) => acc + Math.max(Number(r.reply_rate || 0), eps),
      0
    );
    if (denominator <= 0) continue;

    for (const r of rows) {
      if (r.account_id !== accountId) continue;
      if (r.status && r.status !== "active") continue;

      const current = Number(r.weight || 0.5);
      const target = Math.max(Number(r.reply_rate || 0), eps) / denominator;
      let next = current + lr * (target - current);
      next = Math.max(floorWeight, Math.min(capWeight, next));

      if (Math.abs(next - current) >= 0.02) {
        const { error: updErr } = await supa
          .from("nudge_variants")
          .update({ weight: next })
          .eq("id", r.variant_id)
          .eq("status", "active");
        if (!updErr) updated += 1;
      }
    }
  }

  return json({ ok: true, updated });
});

