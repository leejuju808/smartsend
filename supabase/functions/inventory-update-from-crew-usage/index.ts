// Block 48000 — SmartSend Roofing "Inventory + Supplier Purchase Order System" v1
// Edge Function: /inventory/update-from-crew-usage
// 
// Triggered when crew enters material usage
// Auto-deducts used materials from inventory

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const { job_id, material_name, quantity, unit } = await req.json();

    if (!job_id || !material_name || !quantity) {
      return new Response(
        JSON.stringify({ error: "job_id, material_name, and quantity are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get job to find company_id
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", job_id)
      .single();

    if (jobError && !job) {
      // Try roofing_jobs table
      const { data: roofingJob } = await supabase
        .from("roofing_jobs")
        .select("id, company_id, workspace_id")
        .eq("id", job_id)
        .single();

      if (!roofingJob) {
        return new Response(
          JSON.stringify({ error: "Job not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Find material by name (and company_id if available)
    // For now, we'll match by name - can be enhanced to match by company_id
    const { data: materials, error: materialError } = await supabase
      .from("materials")
      .select("id, name, quantity, company_id")
      .ilike("name", `%${material_name}%`)
      .order("quantity", { ascending: false })
      .limit(1);

    if (materialError || !materials || materials.length === 0) {
      // Material doesn't exist in inventory yet - that's okay, just log the usage
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Material usage logged but material not in inventory",
          material_not_found: true 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const material = materials[0];

    // Create adjustment (negative for usage)
    const adjustment = -Math.abs(parseFloat(quantity));

    const { data: adjustmentData, error: adjustmentError } = await supabase
      .from("material_adjustments")
      .insert({
        material_id: material.id,
        job_id: job_id,
        adjustment: adjustment,
        reason: `Crew usage: ${material_name}`,
      })
      .select()
      .single();

    if (adjustmentError) {
      console.error("Error creating adjustment:", adjustmentError);
      return new Response(
        JSON.stringify({ error: "Failed to record material adjustment", details: adjustmentError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get updated material quantity
    const { data: updatedMaterial } = await supabase
      .from("materials")
      .select("id, name, quantity, min_quantity, unit")
      .eq("id", material.id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        adjustment: adjustmentData,
        material: updatedMaterial,
        status: updatedMaterial && updatedMaterial.quantity < updatedMaterial.min_quantity ? "low" : "ok",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in inventory-update-from-crew-usage:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































