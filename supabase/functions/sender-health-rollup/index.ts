// supabase/functions/sender-health-rollup/index.ts
// Nightly health rollup job

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async () => {
  try {
    // Aggregate yesterday's outcomes by mailbox
    const { data: rows, error: rpcError } = await sb.rpc("rollup_sender_metrics_yesterday");

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const r of rows) {
      const health =
        1 -
        Math.min(0.6, (r.bounces / Math.max(1, r.sends)) * 6) - // heavy penalty on bounces
        Math.min(0.3, (r.complaints / Math.max(1, r.sends)) * 30) - // strong penalty on complaints
        Math.min(0.1, Math.max(0, 0.15 - r.opens / Math.max(1, r.sends)) * 1); // low opens

      const { error: upsertError } = await sb.from("sender_health").upsert(
        {
          account_id: r.account_id,
          mailbox_email: r.mailbox_email,
          day: r.day,
          sends: r.sends,
          bounces: r.bounces,
          complaints: r.complaints,
          unsubscribes: r.unsubscribes,
          opens: r.opens,
          replies: r.replies,
          health_score: Math.max(0, Math.min(1, health)),
        },
        { onConflict: "account_id,mailbox_email,day" },
      );

      if (upsertError) {
        console.error(`Error upserting health for ${r.mailbox_email}:`, upsertError);
        continue;
      }

      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});















