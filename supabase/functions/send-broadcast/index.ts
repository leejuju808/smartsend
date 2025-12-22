// supabase/functions/send-broadcast/index.ts
// Processes scheduled broadcasts and queues emails

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  try {
    // Find scheduled broadcasts that are ready to send
    const now = new Date().toISOString();
    const { data: scheduledBroadcasts, error: fetchError } = await sb
      .from("broadcasts")
      .select("id, workspace_id")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (fetchError) {
      console.error("Error fetching scheduled broadcasts:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    if (!scheduledBroadcasts || scheduledBroadcasts.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No scheduled broadcasts ready" }),
        { headers: { "content-type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const broadcast of scheduledBroadcasts) {
      try {
        // Prepare broadcast (load segment leads, create recipients)
        const { data: prepareResult, error: prepareError } = await sb.rpc(
          "prepare_broadcast_send",
          { p_broadcast_id: broadcast.id }
        );

        if (prepareError) {
          console.error(`Error preparing broadcast ${broadcast.id}:`, prepareError);
          errors++;
          continue;
        }

        if (prepareResult?.error) {
          console.error(`Broadcast ${broadcast.id} preparation error:`, prepareResult.error);
          errors++;
          continue;
        }

        // Queue emails in batches
        const { error: queueError } = await sb.rpc("queue_broadcast_emails", {
          p_broadcast_id: broadcast.id,
          p_batch_size: 100,
        });

        if (queueError) {
          console.error(`Error queueing broadcast ${broadcast.id}:`, queueError);
          // Don't fail completely, emails may be queued by other processes
        }

        processed++;
      } catch (e) {
        console.error(`Error processing broadcast ${broadcast.id}:`, e);
        errors++;
      }
    }

    // Process sending broadcasts (queue more emails if needed)
    const { data: sendingBroadcasts } = await sb
      .from("broadcasts")
      .select("id")
      .eq("status", "sending");

    let queued = 0;
    for (const broadcast of sendingBroadcasts || []) {
      try {
        // Check if there are unqueued recipients
        const { count } = await sb
          .from("broadcast_recipients")
          .select("*", { count: "exact", head: true })
          .eq("broadcast_id", broadcast.id)
          .eq("sent", false)
          .is("queue_id", null);

        if (count && count > 0) {
          await sb.rpc("queue_broadcast_emails", {
            p_broadcast_id: broadcast.id,
            p_batch_size: 100,
          });
          queued++;
        }
      } catch (e) {
        console.error(`Error queueing broadcast ${broadcast.id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scheduled_processed: processed,
        sending_queued: queued,
        errors,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-broadcast function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});



