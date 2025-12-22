// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// Edge Function: /equipment-checkout
// Handles equipment checkout operations

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { equipment_id, crew_member_id, job_id, checkout_notes, condition } =
      await req.json();

    if (!equipment_id || !crew_member_id) {
      return new Response(
        JSON.stringify({ error: "equipment_id and crew_member_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Call the database function
    const { data, error } = await supabase.rpc("checkout_equipment", {
      p_equipment_id: equipment_id,
      p_crew_member_id: crew_member_id,
      p_job_id: job_id || null,
      p_checkout_notes: checkout_notes || null,
      p_condition: condition || "functional",
    });

    if (error) {
      console.error("Error checking out equipment:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, checkout_id: data }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in equipment-checkout:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});




























