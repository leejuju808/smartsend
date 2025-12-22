// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Edge Function: /profit/calc
// Calculates estimated vs actual profit, variance, and health score

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
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get cost data from job_costs table (from Block 37444)
    const { data: jobCosts } = await supabase
      .from("job_costs")
      .select("*")
      .eq("job_id", job_id)
      .single();

    // Get actual costs from job_cost_items and crew_hours
    const { data: costItems } = await supabase
      .from("job_cost_items")
      .select("*")
      .eq("job_id", job_id);

    const { data: crewHours } = await supabase
      .from("crew_hours")
      .select("*")
      .eq("job_id", job_id);

    // Calculate estimated costs (from job_costs if available, otherwise from job_cost_items)
    const estimated_material_cost = jobCosts?.materials_cost || 0;
    const estimated_labor_cost = jobCosts?.labor_cost || 0;
    const estimated_equipment_cost = jobCosts?.equipment_cost || 0;
    const estimated_overhead_cost = (estimated_material_cost + estimated_labor_cost) * 0.15; // 15% overhead

    // Calculate actual costs
    let actual_material_cost = 0;
    let actual_labor_cost = 0;
    let actual_equipment_cost = 0;

    if (costItems) {
      costItems.forEach((item) => {
        if (item.category === "materials") {
          actual_material_cost += Number(item.amount || 0);
        } else if (item.category === "equipment") {
          actual_equipment_cost += Number(item.amount || 0);
        }
      });
    }

    if (crewHours) {
      crewHours.forEach((hours) => {
        actual_labor_cost += Number(hours.total_cost || 0);
      });
    }

    // If we have job_costs data, use it for more accurate calculations
    if (jobCosts) {
      actual_material_cost = jobCosts.actual_material_cost || actual_material_cost;
      actual_labor_cost = jobCosts.actual_labor_cost || actual_labor_cost;
      actual_equipment_cost = jobCosts.actual_equipment_cost || actual_equipment_cost;
    }

    const actual_overhead_cost = (actual_material_cost + actual_labor_cost) * 0.15;

    // Get revenue from job
    const revenue = Number(job.contract_value || 0);

    // Calculate profits
    const estimated_profit = revenue - (
      estimated_material_cost +
      estimated_labor_cost +
      estimated_equipment_cost +
      estimated_overhead_cost
    );

    const actual_profit = revenue - (
      actual_material_cost +
      actual_labor_cost +
      actual_equipment_cost +
      actual_overhead_cost
    );

    const variance = actual_profit - estimated_profit;

    // Calculate margin
    const margin_percent = revenue > 0
      ? ((actual_profit / revenue) * 100)
      : 0;

    // Calculate health score using database function
    const { data: healthScoreData } = await supabase.rpc(
      "calculate_profit_health_score",
      {
        p_margin_percent: margin_percent,
        p_variance: variance,
        p_actual_profit: actual_profit,
      }
    );

    const health_score = healthScoreData || 0;

    // Upsert profit_analysis
    const { data: profitAnalysis, error: upsertError } = await supabase
      .from("profit_analysis")
      .upsert({
        job_id,
        team_id: job.team_id,
        estimated_material_cost,
        estimated_labor_cost,
        estimated_equipment_cost,
        estimated_overhead_cost,
        actual_material_cost,
        actual_labor_cost,
        actual_equipment_cost,
        actual_overhead_cost,
        revenue,
        health_score,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "job_id",
      })
      .select()
      .single();

    if (upsertError) {
      console.error("Error upserting profit analysis:", upsertError);
    }

    // Return comprehensive result
    return new Response(
      JSON.stringify({
        success: true,
        job_id,
        estimated_profit: Math.round(estimated_profit * 100) / 100,
        actual_profit: Math.round(actual_profit * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        margin_percent: Math.round(margin_percent * 100) / 100,
        health_score,
        costs: {
          estimated: {
            material: estimated_material_cost,
            labor: estimated_labor_cost,
            equipment: estimated_equipment_cost,
            overhead: estimated_overhead_cost,
            total: estimated_material_cost + estimated_labor_cost + estimated_equipment_cost + estimated_overhead_cost,
          },
          actual: {
            material: actual_material_cost,
            labor: actual_labor_cost,
            equipment: actual_equipment_cost,
            overhead: actual_overhead_cost,
            total: actual_material_cost + actual_labor_cost + actual_equipment_cost + actual_overhead_cost,
          },
        },
        revenue,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error calculating profit:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});





























