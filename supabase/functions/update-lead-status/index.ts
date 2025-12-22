// Block 21845 — SmartSend Roofing Pipeline Board v1
// Edge Function — Update Lead Status
// Triggered when dragging a lead between columns on the pipeline board

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Valid roofing pipeline statuses
const VALID_STATUSES = [
  'new_lead',
  'contacted',
  'estimate_booked',
  'estimate_completed',
  'proposal_sent',
  'decision_pending',
  'won',
  'lost'
];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { lead_id, new_status } = await req.json();

    if (!lead_id || !new_status) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: lead_id and new_status" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Validate status
    if (!VALID_STATUSES.includes(new_status)) {
      return new Response(
        JSON.stringify({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Get current status before update
    const { data: currentLead, error: fetchError } = await supabase
      .from("leads")
      .select("status")
      .eq("id", lead_id)
      .single();

    if (fetchError || !currentLead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { 
          status: 404, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    const old_status = currentLead.status;

    // Update lead status
    const { data, error } = await supabase
      .from("leads")
      .update({ 
        status: new_status,
        updated_at: new Date().toISOString()
      })
      .eq("id", lead_id)
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Log timeline event (trigger will also log, but we can add explicit logging here)
    // The database trigger will handle this automatically, but we can add extra context if needed
    await supabase
      .from("lead_timeline_events")
      .insert({
        lead_id,
        event_type: "status_changed",
        event_subtype: "pipeline_board_drag",
        message: `Status changed from ${old_status} to ${new_status}`,
        metadata: {
          old_status,
          new_status,
          changed_at: new Date().toISOString()
        }
      });

    return new Response(
      JSON.stringify({ success: true, data }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
});

