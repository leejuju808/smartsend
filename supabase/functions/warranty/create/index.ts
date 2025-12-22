// Block 52000 — SmartSend Roofing Warranty Tracking + Service Call System v1
// Edge Function: /warranty/create
// Creates a warranty record when QC passes (can also be called manually)

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
      job_id,
      install_date,
      workmanship_years,
      manufacturer_info,
      shingle_type,
      material_summary,
    } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, lead_id, scheduled_end_date, scheduled_start_date")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if warranty already exists
    const { data: existingWarranty } = await supabase
      .from("warranties")
      .select("id")
      .eq("job_id", job_id)
      .single();

    if (existingWarranty) {
      return new Response(
        JSON.stringify({
          error: "Warranty already exists for this job",
          warranty_id: existingWarranty.id,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get homeowner_id
    const { data: homeowner } = await supabase
      .from("homeowners")
      .select("id")
      .eq("job_id", job_id)
      .limit(1)
      .maybeSingle();

    // Get QC inspection if exists
    const { data: qcInspection } = await supabase
      .from("qc_inspections")
      .select("id, score")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get closeout packet if exists
    const { data: closeoutPacket } = await supabase
      .from("closeout_packets")
      .select("id")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Determine install date
    const finalInstallDate = install_date
      ? new Date(install_date)
      : job.scheduled_end_date
      ? new Date(job.scheduled_end_date)
      : new Date();

    // Calculate expiration date
    const warrantyYears = workmanship_years || 5;
    const expirationDate = new Date(finalInstallDate);
    expirationDate.setFullYear(expirationDate.getFullYear() + warrantyYears);

    // Get address from lead if available
    let address = null;
    if (job.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("address, city, state, zip")
        .eq("id", job.lead_id)
        .single();

      if (lead) {
        const addressParts = [
          lead.address,
          lead.city,
          lead.state,
          lead.zip,
        ].filter(Boolean);
        address = addressParts.join(", ");
      }
    }

    // Create warranty
    const { data: warranty, error: warrantyError } = await supabase
      .from("warranties")
      .insert({
        job_id: job.id,
        homeowner_id: homeowner?.id || null,
        workspace_id: job.workspace_id,
        install_date: finalInstallDate.toISOString().split("T")[0],
        expiration_date: expirationDate.toISOString().split("T")[0],
        workmanship_years: warrantyYears,
        manufacturer_info: manufacturer_info || {},
        shingle_type: shingle_type || null,
        qc_score: qcInspection?.score || null,
        qc_inspection_id: qcInspection?.id || null,
        closeout_packet_id: closeoutPacket?.id || null,
        material_summary: material_summary || {},
        address: address,
        status: "active",
      })
      .select()
      .single();

    if (warrantyError) {
      console.error("Error creating warranty:", warrantyError);
      return new Response(
        JSON.stringify({ error: warrantyError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        warranty: warranty,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in warranty/create:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































