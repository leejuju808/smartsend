// Block 53000 — SmartSend Roofing "Storm Response + Emergency Dispatch System" v1
// Edge Function: /storm/assign-tech
// 
// Dispatches tech to inspection request

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
    const { request_id, technician_id } = await req.json();

    if (!request_id || !technician_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: request_id, technician_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify technician exists and is in same workspace
    const { data: tech, error: techError } = await supabase
      .from("crew_members")
      .select("id, workspace_id, name")
      .eq("id", technician_id)
      .single();

    if (techError || !tech) {
      return new Response(
        JSON.stringify({ error: "Technician not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get inspection request
    const { data: request, error: requestError } = await supabase
      .from("storm_inspection_requests")
      .select("*")
      .eq("id", request_id)
      .single();

    if (requestError || !request) {
      return new Response(
        JSON.stringify({ error: "Inspection request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify same workspace
    if (request.workspace_id !== tech.workspace_id) {
      return new Response(
        JSON.stringify({ error: "Technician and request must be in same workspace" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update request with assignment
    const { data: updatedRequest, error: updateError } = await supabase
      .from("storm_inspection_requests")
      .update({
        technician_id,
        status: "assigned",
        assigned_at: new Date().toISOString(),
      })
      .eq("id", request_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // TODO: Send notification to technician
    // TODO: Build route optimization (v1 simple ordering by ZIP)

    return new Response(
      JSON.stringify({
        ok: true,
        inspection_request: updatedRequest,
        technician: tech,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in storm/assign-tech:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































