// Block 52000 — SmartSend Roofing Warranty Tracking + Service Call System v1
// Edge Function: /service/complete-ticket
// Completes a service ticket with fix documentation

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
    const {
      ticket_id,
      technician_id,
      fix_photos,
      fix_description,
      materials_used,
      labor_hours,
      start_time,
      end_time,
    } = await req.json();

    if (!ticket_id) {
      return new Response(
        JSON.stringify({ error: "ticket_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify ticket exists
    const { data: ticket, error: ticketError } = await supabase
      .from("service_tickets")
      .select("*")
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

    // Create fix record
    const fixData: any = {
      ticket_id: ticket_id,
      fix_photos: fix_photos || [],
      fix_description: fix_description || null,
      materials_used: materials_used || [],
      labor_hours: labor_hours || null,
    };

    if (technician_id) {
      fixData.technician_id = technician_id;
    } else if (ticket.technician_id) {
      fixData.technician_id = ticket.technician_id;
    }

    if (start_time) {
      fixData.start_time = start_time;
    }
    if (end_time) {
      fixData.end_time = end_time;
    }

    const { data: fix, error: fixError } = await supabase
      .from("service_ticket_fixes")
      .insert(fixData)
      .select()
      .single();

    if (fixError) {
      console.error("Error creating fix record:", fixError);
      return new Response(
        JSON.stringify({ error: fixError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate costs if out of warranty
    let totalCost = null;
    let materialCost = null;
    if (ticket.warranty_status === "out_of_warranty" || ticket.warranty_status === "fee_required") {
      // Calculate material cost
      if (materials_used && Array.isArray(materials_used)) {
        materialCost = materials_used.reduce((sum: number, item: any) => {
          return sum + (item.cost || 0);
        }, 0);
      }

      // Estimate labor cost (could be configurable per workspace)
      const laborRate = 75; // $75/hour default
      const laborCost = (labor_hours || 0) * laborRate;
      totalCost = (materialCost || 0) + laborCost;
    }

    // Update ticket status
    const updateData: any = {
      status: "completed",
      completed_at: new Date().toISOString(),
    };

    if (labor_hours) {
      updateData.labor_hours = labor_hours;
    }
    if (materialCost !== null) {
      updateData.material_cost = materialCost;
    }
    if (totalCost !== null) {
      updateData.total_cost = totalCost;
      updateData.invoice_required = totalCost > 0;
    }

    const { data: updatedTicket, error: updateError } = await supabase
      .from("service_tickets")
      .update(updateData)
      .eq("id", ticket_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating ticket:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // TODO: Send completion notification to homeowner
    // TODO: Create invoice if required
    // TODO: Update job lifetime cost

    return new Response(
      JSON.stringify({
        success: true,
        ticket: updatedTicket,
        fix: fix,
        invoice_required: updatedTicket.invoice_required,
        total_cost: updatedTicket.total_cost,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in service/complete-ticket:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































