// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const SECRET = Deno.env.get("USAGE_SECRET")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-ss-secret") !== SECRET) return new Response("unauthorized", { status: 401 });

  // 1) Pull a small batch of unreported events (idempotent by marking later)
  const { data: evts, error } = await sb
    .from("usage_events")
    .select("id, team_id, metric, quantity, at")
    .eq("reported", false)
    .order("at", { ascending: true })
    .limit(200);

  if (error) throw error;

  if (!evts?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }));

  // group by team + metric (Stripe likes aggregated hits but accepts individual too)
  const groups = new Map<string, { team_id: string; metric: string; qty: number; ts: number[] }>();
  for (const e of evts) {
    const key = `${e.team_id}:${e.metric}`;
    const g = groups.get(key) ?? { team_id: e.team_id as string, metric: e.metric as string, qty: 0, ts: [] as number[] };
    g.qty += e.quantity as number;
    g.ts.push(Math.floor(new Date(e.at as string).getTime() / 1000));
    groups.set(key, g);
  }

  // 2) For each group, find subscription_item and create usage record
  let sent = 0;
  for (const g of groups.values()) {
    const { data: bc } = await sb.from("billing_customers")
      .select("item_sends_id,item_ai_id")
      .eq("team_id", g.team_id).maybeSingle();
    if (!bc) continue;

    const itemId = g.metric === "send" ? bc.item_sends_id
                 : g.metric === "ai_rewrite" ? bc.item_ai_id
                 : null;

    if (!itemId) continue;

    // Use the latest timestamp in group for "timestamp"
    const ts = g.ts[g.ts.length - 1];

    const rec = await stripe.subscriptionItems.createUsageRecord(itemId, {
      action: "increment",
      quantity: g.qty,
      timestamp: ts
    });

    // Mark only the events we just summarized as reported
    const ids = evts.filter((e: any) => e.team_id === g.team_id && e.metric === g.metric).map((e: any) => e.id);
    await sb.from("usage_events").update({
      reported: true,
      stripe_usage_record_id: rec.id
    }).in("id", ids);

    sent += g.qty;
  }

  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});

