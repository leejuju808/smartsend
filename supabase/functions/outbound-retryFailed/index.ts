// supabase/functions/outbound-retryFailed/index.ts
// Block 15500 — Retry Failed Jobs v2
// Processes retry queue with exponential backoff

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Find jobs that are ready for retry
    const { data: retryJobs, error } = await supabaseAdmin
      .from("campaign_send_queue")
      .select("*")
      .eq("status", "retry")
      .not("next_retry_at", "is", null)
      .lte("next_retry_at", new Date().toISOString())
      .lt("attempts", supabaseAdmin.raw("max_attempts"))
      .eq("suppressed", false)
      .order("next_retry_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("Error fetching retry jobs:", error);
      return new Response(
        JSON.stringify({ error: "fetch_failed", details: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!retryJobs || retryJobs.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "no retry jobs ready" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Reset status to pending so they can be picked up by process-send-queue
    const jobIds = retryJobs.map((j: any) => j.id);
    const { error: updateError } = await supabaseAdmin
      .from("campaign_send_queue")
      .update({
        status: "pending",
        next_retry_at: null,
      })
      .in("id", jobIds);

    if (updateError) {
      console.error("Error updating retry jobs:", updateError);
      return new Response(
        JSON.stringify({ error: "update_failed", details: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log retry events
    for (const job of retryJobs) {
      await supabaseAdmin.from("deliverability_events").insert({
        workspace_id: job.workspace_id,
        campaign_id: job.campaign_id,
        contact_id: job.contact_id,
        event_type: "retry_scheduled",
        event_data: {
          queue_id: job.id,
          retry_count: job.retry_count,
          next_retry_at: job.next_retry_at,
        },
      }).catch((err) => {
        console.error("Failed to log retry event:", err);
      });
    }

    return new Response(
      JSON.stringify({
        processed: retryJobs.length,
        message: "retry jobs reset to pending",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Retry processor error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































