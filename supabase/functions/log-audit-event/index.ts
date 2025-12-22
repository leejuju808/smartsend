// /supabase/functions/log-audit-event/index.ts
// Block 21947 — SmartSend Lead Audit Log Writer
// This Edge Function logs EVERY meaningful action into the immutable audit log
// Used by all SmartSend automation modules and user actions

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
    const {
      lead_id,
      event_type,
      actor_type,
      actor_id,
      event_data,
    } = await req.json();

    // Validate required fields
    if (!lead_id || !event_type || !actor_type) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required fields: lead_id, event_type, and actor_type are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate actor_type
    if (!["system", "user", "homeowner"].includes(actor_type)) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid actor_type. Must be one of: system, user, homeowner",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Insert audit log event
    const { data, error } = await supabase
      .from("lead_audit_logs")
      .insert({
        lead_id,
        event_type,
        actor_type,
        actor_id: actor_id || null,
        event_data: event_data || {},
      })
      .select()
      .single();

    if (error) {
      console.error("Audit log insert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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









































