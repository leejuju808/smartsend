// Block 52000 — SmartSend Roofing Warranty Tracking + Service Call System v1
// Edge Function: /service/assign-tech
// Assigns a technician to a service ticket

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ticket_id, technician_id, scheduled_date, scheduled_time, notes } =
      await req.json();

    if (!ticket_id || !technician_id) {
      return new Response(
        JSON.stringify({
          error: "ticket_id and technician_id are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify ticket exists
    const { data: ticket, error: ticketError } = await supabase
      .from("service_tickets")
      .select("id, status, workspace_id")
      .eq("id", ticket_id)
      .single();

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ error: "Service ticket not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify technician exists
    const { data: technician, error: techError } = await supabase
      .from("crew_members")
      .select("id, name, workspace_id")
      .eq("id", technician_id)
      .single();

    if (techError || !technician) {
      return new Response(
        JSON.stringify({ error: "Technician not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify technician is in same workspace
    if (technician.workspace_id !== ticket.workspace_id) {
      return new Response(
        JSON.stringify({
          error: "Technician must be in the same workspace as the ticket",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update ticket
    const updateData: any = {
      technician_id: technician_id,
      status: ticket.status === "open" ? "assigned" : ticket.status,
    };

    if (scheduled_date) {
      updateData.scheduled_date = scheduled_date;
    }
    if (scheduled_time) {
      updateData.scheduled_time = scheduled_time;
    }
    if (notes) {
      updateData.notes = notes;
    }

    const { data: updatedTicket, error: updateError } = await supabase
      .from("service_tickets")
      .update(updateData)
      .eq("id", ticket_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error assigning technician:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // TODO: Send notification to technician
    // TODO: Send confirmation to homeowner

    return new Response(
      JSON.stringify({
        success: true,
        ticket: updatedTicket,
        technician: {
          id: technician.id,
          name: technician.name,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in service/assign-tech:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































