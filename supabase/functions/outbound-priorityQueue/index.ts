// supabase/functions/outbound-priorityQueue/index.ts
// Block 15500 — Priority Queue Processor v2
// Processes send queue with priority-based ordering

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
    const { workspace_id, batch_size = 25 } = await req.json().catch(() => ({}));

    const workerId = crypto.randomUUID();

    // Use v2 priority queue function
    const { data: jobs, error } = await supabaseAdmin.rpc(
      "lock_send_queue_batch_v2",
      {
        p_worker_id: workerId,
        p_limit: batch_size,
        p_workspace_id: workspace_id || null,
      }
    );

    if (error) {
      console.error("lock_send_queue_batch_v2 error:", error);
      return new Response(
        JSON.stringify({ error: "lock_failed", details: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "no ready jobs" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Return jobs for processing (actual sending happens in process-send-queue)
    return new Response(
      JSON.stringify({
        processed: jobs.length,
        jobs: jobs.map((j: any) => ({
          id: j.id,
          priority: j.priority,
          step_number: j.step_number,
          contact_id: j.contact_id,
        })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Priority queue error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































