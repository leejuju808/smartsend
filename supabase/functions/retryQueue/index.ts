// supabase/functions/retryQueue/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type RetryPayload = {
  queue_ids: string[];          // send_queue.id[]
  max_attempts?: number;        // default 3
  reason?: string;              // optional note for campaign_logs
};

serve(async (req) => {
  try {
    const { queue_ids, max_attempts = 3, reason } = (await req.json()) as RetryPayload;
    if (!queue_ids?.length) throw new Error("queue_ids required");

    // 1) Fetch target rows
    const { data: rows, error: fetchErr } = await supabase
      .from("send_queue")
      .select("id, lead_id, campaign_id, status, attempt, scheduled_at")
      .in("id", queue_ids);

    if (fetchErr) throw fetchErr;

    // 2) Partition by eligibility
    const canRetry = (rows ?? []).filter(r => (r.attempt ?? 0) < max_attempts);
    const blocked  = (rows ?? []).filter(r => (r.attempt ?? 0) >= max_attempts);

    // 3) Update eligible → queued (+1 attempt, now)
    if (canRetry.length) {
      const ids = canRetry.map(r => r.id);
      
      // Use RPC for atomic increment
      const { error: rpcErr } = await supabase.rpc('retry_queue_atomic', {
        _ids: ids,
        _max_attempts: max_attempts
      });

      if (rpcErr) {
        // Fallback: use SQL UPDATE with incremental logic via upsert pattern
        for (const id of ids) {
          const row = rows.find(r => r.id === id);
          if (row) {
            const { error: updErr } = await supabase
              .from("send_queue")
              .update({
                status: "queued",
                attempt: (row.attempt ?? 0) + 1,
                scheduled_at: new Date().toISOString()
              })
              .eq("id", id);
            if (updErr) throw updErr;
          }
        }
      }

      // 4) Log each retry
      const logs = canRetry.map(r => ({
        campaign_id: r.campaign_id,
        lead_id: r.lead_id,
        type: "retry_enqueued",
        message: reason ?? `Retry queued (attempt ${(r.attempt ?? 0) + 1}/${max_attempts})`,
        created_at: new Date().toISOString()
      }));
      const { error: logErr } = await supabase.from("campaign_logs").insert(logs);
      if (logErr) throw logErr;
    }

    // 5) Log any blocked
    if (blocked.length) {
      const logs = blocked.map(r => ({
        campaign_id: r.campaign_id,
        lead_id: r.lead_id,
        type: "retry_blocked",
        message: `Max attempts reached (${max_attempts})`,
        created_at: new Date().toISOString()
      }));
      const { error: logErr } = await supabase.from("campaign_logs").insert(logs);
      if (logErr) throw logErr;
    }

    return new Response(JSON.stringify({
      success: true,
      retried: canRetry.map(r => r.id),
      blocked: blocked.map(r => r.id),
      max_attempts
    }), { headers: { "Content-Type": "application/json" }});
  } catch (e: any) {
    console.error("retryQueue error:", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
});

