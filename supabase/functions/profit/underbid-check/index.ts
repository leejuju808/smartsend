// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Edge Function: /profit/underbid-check
// Flags underpriced proposals before they're sent

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
    const { job_id, proposed_price } = await req.json();

    if (!job_id || !proposed_price) {
      return new Response(
        JSON.stringify({ error: "job_id and proposed_price are required" }),
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

    // Get pricing recommendation if available
    const { data: pricingRec } = await supabase
      .from("pricing_recommendations")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get cost data
    const { data: jobCosts } = await supabase
      .from("job_costs")
      .select("*")
      .eq("job_id", job_id)
      .single();

    // Calculate minimum profitable price
    let minimum_profitable_price = pricingRec?.minimum_price;

    if (!minimum_profitable_price) {
      // Calculate from costs
      const materialCost = jobCosts?.materials_cost || 0;
      const laborCost = jobCosts?.labor_cost || 0;
      const equipmentCost = jobCosts?.equipment_cost || 0;
      const totalCost = materialCost + laborCost + equipmentCost;
      const overhead = totalCost * 0.15;
      const costWithOverhead = totalCost + overhead;
      
      // Minimum 30% margin
      minimum_profitable_price = costWithOverhead / 0.70;
    }

    const proposedPriceNum = Number(proposed_price);
    const minimumPriceNum = Number(minimum_profitable_price);

    // Check if underbid
    const isUnderbid = proposedPriceNum < minimumPriceNum;
    const potentialLoss = isUnderbid ? minimumPriceNum - proposedPriceNum : 0;

    if (!isUnderbid) {
      return new Response(
        JSON.stringify({
          success: true,
          is_underbid: false,
          proposed_price: proposedPriceNum,
          minimum_profitable_price: minimumPriceNum,
          message: "Price is acceptable",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate missing costs breakdown
    const missingCosts = {
      base_difference: minimumPriceNum - proposedPriceNum,
      margin_shortfall: (minimumPriceNum - proposedPriceNum) / minimumPriceNum * 100,
    };

    // Identify risk factors
    const riskFactors = [];
    if (potentialLoss > 1000) {
      riskFactors.push("High potential loss (>$1,000)");
    }
    if (potentialLoss > 3000) {
      riskFactors.push("Critical potential loss (>$3,000)");
    }
    if ((proposedPriceNum / minimumPriceNum) < 0.85) {
      riskFactors.push("Price is more than 15% below minimum");
    }

    // Suggested corrections
    const suggestedCorrections = {
      recommended_price: minimumPriceNum,
      price_increase_needed: potentialLoss,
      margin_target: 30,
      notes: "Increase price to meet minimum profitable threshold",
    };

    // Save underbid detection
    const { data: detection, error: detectionError } = await supabase
      .from("underbid_detections")
      .insert({
        job_id,
        team_id: job.team_id,
        proposed_price: proposedPriceNum,
        minimum_profitable_price: minimumPriceNum,
        missing_costs: missingCosts,
        suggested_corrections: suggestedCorrections,
        risk_factors: riskFactors,
        status: "detected",
      })
      .select()
      .single();

    if (detectionError) {
      console.error("Error saving underbid detection:", detectionError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        is_underbid: true,
        proposed_price: proposedPriceNum,
        minimum_profitable_price: minimumPriceNum,
        potential_loss: Math.round(potentialLoss * 100) / 100,
        missing_costs: missingCosts,
        suggested_corrections: suggestedCorrections,
        risk_factors: riskFactors,
        message: `⚠️ Underbid Detected — This price may result in a $${Math.round(potentialLoss).toLocaleString()} loss.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking underbid:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});





























