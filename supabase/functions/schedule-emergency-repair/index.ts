// Block 40210 — SmartSend Roofing "Storm Response + Rapid Deployment Engine" v1
// Edge Function: /schedule-emergency-repair
// 
// Automatically schedules emergency repairs and assigns crews

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
    const { storm_lead_id, crew_id, repair_type, eta_hours } = await req.json();

    if (!storm_lead_id) {
      return new Response(
        JSON.stringify({ error: "storm_lead_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get storm lead info
    const { data: stormLead, error: leadError } = await supabase
      .from("storm_leads")
      .select("*, workspace_id, urgency, damage_type")
      .eq("id", storm_lead_id)
      .single();

    if (leadError || !stormLead) {
      return new Response(
        JSON.stringify({ error: "Storm lead not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determine repair type if not provided
    let finalRepairType = repair_type || "emergency_patch";
    if (stormLead.damage_type === "leak" || stormLead.urgency === "emergency") {
      finalRepairType = "leak_mitigation";
    } else if (stormLead.damage_type === "missing_shingles") {
      finalRepairType = "blue_tarp";
    }

    // Calculate ETA (default: 1 hour, or use provided hours)
    const etaHours = eta_hours || 1;
    const eta = new Date(Date.now() + etaHours * 60 * 60 * 1000);

    // If crew_id not provided, find available crew
    let finalCrewId = crew_id;
    if (!finalCrewId) {
      const { data: availableCrews, error: crewsError } = await supabase.rpc(
        "get_available_crews",
        {
          p_workspace_id: stormLead.workspace_id,
          p_specialty: null,
        }
      );

      if (!crewsError && availableCrews && availableCrews.length > 0) {
        // Prefer crews with matching specialties
        const matchingCrew = availableCrews.find((c: any) =>
          c.specialties?.includes(finalRepairType)
        );
        finalCrewId = matchingCrew?.crew_id || availableCrews[0].crew_id;
      }
    }

    // Create emergency repair record
    const { data: repair, error: repairError } = await supabase
      .from("emergency_repairs")
      .insert({
        storm_lead_id: storm_lead_id,
        crew_id: finalCrewId,
        workspace_id: stormLead.workspace_id,
        repair_type: finalRepairType,
        eta: eta.toISOString(),
        scheduled_at: new Date().toISOString(),
        status: finalCrewId ? "assigned" : "pending",
      })
      .select()
      .single();

    if (repairError) {
      console.error("Error creating emergency repair:", repairError);
      return new Response(
        JSON.stringify({ error: "Failed to create emergency repair" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If crew assigned, update crew status
    if (finalCrewId) {
      const { error: assignError } = await supabase.rpc(
        "assign_crew_to_repair",
        {
          p_repair_id: repair.id,
          p_crew_id: finalCrewId,
          p_eta: eta.toISOString(),
        }
      );

      if (assignError) {
        console.error("Error assigning crew:", assignError);
      }
    }

    // Update storm lead status
    await supabase
      .from("storm_leads")
      .update({ status: "scheduled" })
      .eq("id", storm_lead_id);

    return new Response(
      JSON.stringify({
        ok: true,
        repair: {
          id: repair.id,
          crew_id: finalCrewId,
          eta: eta.toISOString(),
          repair_type: finalRepairType,
          status: repair.status,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in schedule-emergency-repair:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































