// Block 53000 — SmartSend Roofing "Storm Response + Emergency Dispatch System" v1
// Edge Function: /storm/request-inspection
// 
// From homeowner portal or storm landing page

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
    const {
      storm_id,
      workspace_id,
      name,
      address,
      phone,
      email,
      zip_code,
      description,
      photos,
      severity_rating,
      source = "storm_landing",
    } = await req.json();

    if (!storm_id || !workspace_id || !name || !address || !zip_code) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: storm_id, workspace_id, name, address, zip_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify storm exists
    const { data: stormEvent, error: stormError } = await supabase
      .from("storm_events")
      .select("*")
      .eq("id", storm_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (stormError || !stormEvent) {
      return new Response(
        JSON.stringify({ error: "Storm event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if homeowner/lead exists
    let homeownerId: string | null = null;
    let leadId: string | null = null;

    if (email) {
      // Try to find existing homeowner
      const { data: homeowner } = await supabase
        .from("homeowners")
        .select("id, job_id")
        .eq("email", email)
        .limit(1)
        .single();

      if (homeowner) {
        homeownerId = homeowner.id;
      } else {
        // Try to find lead
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("workspace_id", workspace_id)
          .eq("email", email)
          .limit(1)
          .single();

        if (lead) {
          leadId = lead.id;
        }
      }
    }

    // Create inspection request
    const { data: inspectionRequest, error: requestError } = await supabase
      .from("storm_inspection_requests")
      .insert({
        storm_id,
        workspace_id,
        homeowner_id: homeownerId,
        lead_id: leadId,
        name,
        address,
        phone,
        email,
        zip_code,
        description,
        photos: photos || [],
        severity_rating,
        status: "open",
        source,
      })
      .select()
      .single();

    if (requestError) {
      throw requestError;
    }

    // Optionally create a job in the pipeline
    if (inspectionRequest) {
      // Create a job for tracking
      const { data: job, error: jobError } = await supabase
        .from("roofing_jobs")
        .insert({
          workspace_id,
          lead_id: leadId,
          homeowner_name: name,
          address,
          current_stage: "NEW_LEAD",
          projected_job_value: null, // Will be set after inspection
        })
        .select()
        .single();

      if (!jobError && job) {
        // Link inspection request to job
        await supabase
          .from("storm_inspection_requests")
          .update({ job_id: job.id })
          .eq("id", inspectionRequest.id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        inspection_request: inspectionRequest,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in storm/request-inspection:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































