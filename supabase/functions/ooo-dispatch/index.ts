import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (_req) => {
  try {
    const nowIso = new Date().toISOString();

    const { data: routes, error } = await sb
      .from("ooo_routes")
      .select("thread_id, campaign_id, lead_id, followup_due_at, step_no, variant_id, status")
      .eq("status", "pending")
      .lte("followup_due_at", nowIso)
      .limit(100);

    if (error) {
      throw error;
    }

    if (!routes || routes.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { "content-type": "application/json" },
      });
    }

    let processed = 0;

    for (const r of routes) {
      const startAt =
        r.followup_due_at ??
        new Date(Date.now() + Math.floor(Math.random() * 60_000)).toISOString();

      const { error: enqueueError } = await sb.rpc("enqueue_step_for_leads", {
        p_campaign: r.campaign_id,
        p_step_no: r.step_no,
        p_leads: [r.lead_id],
        p_start_at: startAt,
        p_per_min: 30,
        p_jitter_seconds: 30,
        p_business_hours: true,
        p_window_start: "08:00",
        p_window_end: "17:00",
        p_days: [1, 2, 3, 4, 5],
        p_skip_holidays: true,
      });

      if (enqueueError) {
        await sb
          .from("ooo_routes")
          .update({
            followup_due_at: new Date(Date.now() + 3_600_000).toISOString(),
          })
          .eq("thread_id", r.thread_id);
        continue;
      }

      await sb
        .from("ooo_routes")
        .update({ status: "scheduled" })
        .eq("thread_id", r.thread_id);

      processed += 1;
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(message, { status: 500 });
  }
});





