// Block 21867 — SmartSend Lead Ownership & Handoff Engine v1
// Edge Function: run_auto_handoff.ts
// Triggered hourly to check all leads for handoff conditions

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    console.log("Starting auto-handoff engine...");

    // Fetch all active leads (not won/lost/closed)
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, workspace_id, owner_id, ownership_mode, status")
      .not("status", "in", ["won", "lost"])
      .neq("ownership_mode", "closed")
      .limit(1000); // Process in batches

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      throw leadsError;
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active leads to process",
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Processing ${leads.length} leads...`);

    let handoffsPerformed = 0;
    let escalationsPerformed = 0;
    const errors: string[] = [];

    // Process each lead
    for (const lead of leads) {
      try {
        // Check if lead needs handoff
        const { data: checkResult, error: checkError } = await supabase.rpc(
          "check_lead_handoff_conditions",
          {
            p_lead_id: lead.id,
          }
        );

        if (checkError) {
          console.error(`Error checking lead ${lead.id}:`, checkError);
          errors.push(`Lead ${lead.id}: ${checkError.message}`);
          continue;
        }

        // checkResult is an array (table return)
        if (checkResult && Array.isArray(checkResult) && checkResult.length > 0) {
          const condition = checkResult[0];
          
          if (condition.needs_handoff && condition.suggested_owner_id) {
            // Perform handoff
            const { error: handoffError } = await supabase.rpc("perform_lead_handoff", {
              p_lead_id: lead.id,
              p_new_owner_id: condition.suggested_owner_id,
              p_reason: condition.reason,
              p_triggered_by: null, // System triggered
            });

            if (handoffError) {
              console.error(`Error handoff lead ${lead.id}:`, handoffError);
              errors.push(`Lead ${lead.id}: ${handoffError.message}`);
            } else {
              handoffsPerformed++;
              console.log(
                `Handed off lead ${lead.id} to ${condition.suggested_owner_id} (reason: ${condition.reason})`
              );
            }
          } else if (condition.needs_handoff && condition.reason === "high_value_probability_drop") {
            // Escalate to owner
            const { data: workspaceOwner } = await supabase
              .from("workspace_members")
              .select("user_id")
              .eq("workspace_id", lead.workspace_id)
              .eq("role", "owner")
              .limit(1)
              .single();

            if (workspaceOwner?.user_id) {
              const { error: escalateError } = await supabase.rpc("perform_lead_handoff", {
                p_lead_id: lead.id,
                p_new_owner_id: workspaceOwner.user_id,
                p_reason: "needs_owner_intervention",
                p_triggered_by: null,
              });

              if (escalateError) {
                console.error(`Error escalating lead ${lead.id}:`, escalateError);
                errors.push(`Lead ${lead.id}: ${escalateError.message}`);
              } else {
                escalationsPerformed++;
                console.log(`Escalated lead ${lead.id} to owner`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing lead ${lead.id}:`, error);
        errors.push(`Lead ${lead.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Auto handoff run complete",
        processed: leads.length,
        handoffs_performed: handoffsPerformed,
        escalations_performed: escalationsPerformed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in run-auto-handoff:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});









































