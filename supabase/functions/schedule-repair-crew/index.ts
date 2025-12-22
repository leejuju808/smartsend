// Edge Function: schedule-repair-crew
// Auto-schedules repair crew based on homeowner availability

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { ticket_id, time_slot, crew_id, crew_name } = await req.json();

    if (!ticket_id || !time_slot) {
      return new Response(
        JSON.stringify({ error: "ticket_id and time_slot are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse time_slot (ISO string or timestamp)
    const scheduledAt = new Date(time_slot);
    if (isNaN(scheduledAt.getTime())) {
      return new Response(
        JSON.stringify({ error: "Invalid time_slot format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update ticket
    const updateData: any = {
      scheduled_at: scheduledAt.toISOString(),
      status: "scheduled",
    };

    if (crew_id) {
      updateData.crew_assigned_id = crew_id;
    }

    if (crew_name) {
      updateData.crew_assigned_name = crew_name;
    }

    const { data: ticket, error: updateError } = await supabase
      .from("service_tickets")
      .update(updateData)
      .eq("id", ticket_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating ticket:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to schedule repair", details: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log event
    await supabase
      .from("service_events")
      .insert({
        ticket_id,
        event: "scheduled",
        metadata: {
          scheduled_at: scheduledAt.toISOString(),
          crew_id: crew_id || null,
          crew_name: crew_name || null,
        },
      });

    return new Response(
      JSON.stringify({ ok: true, ticket }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "access-control-allow-origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in schedule-repair-crew:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "access-control-allow-origin": "*",
        },
      }
    );
  }
});
































