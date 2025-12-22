// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { campaign_id, batch_limit = 200, now } = (await req.json().catch(() => ({}))) ?? {};
    const p_now = now ?? new Date().toISOString();

    // Option A: tick a single campaign
    if (campaign_id) {
      const { data, error } = await supabase.rpc("enqueue_due_for_campaign", {
        p_campaign: campaign_id,
        p_now,
        p_batch_limit: batch_limit
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, result: data?.[0] ?? null }), { headers: { "content-type": "application/json" } });
    }

    // Option B: tick all active campaigns for today's mailbox windows
    const { data: campaigns, error: cErr } = await supabase
      .from("campaigns")
      .select("id")
      .eq("status", "active"); // adjust if you have a status column
    if (cErr) throw cErr;

    let total = 0;
    for (const c of campaigns ?? []) {
      const { data, error } = await supabase.rpc("enqueue_due_for_campaign", {
        p_campaign: c.id,
        p_now,
        p_batch_limit: batch_limit
      });
      if (error) throw error;
      total += (data?.[0]?.enqueued ?? 0);
    }

    return new Response(JSON.stringify({ ok: true, enqueued_total: total }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
