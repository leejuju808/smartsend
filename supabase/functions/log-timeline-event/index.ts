// /supabase/functions/log-timeline-event/index.ts
// Block 21727.20 — SmartSend Timeline Event Writer (System Logging Brain)
// This Edge Function automatically logs EVERY meaningful action into the Unified Lead Timeline

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const { lead_id, event_type, event_title, event_body, metadata } =
      await req.json();

    // Validate required fields
    if (!lead_id || !event_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: lead_id and event_type are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Insert timeline event
    const { data, error } = await supabase
      .from("lead_timeline_events")
      .insert({
        lead_id,
        event_type,
        event_title: event_title || null,
        event_body: event_body || null,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error("Timeline event insert error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});










































