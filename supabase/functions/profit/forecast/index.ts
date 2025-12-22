// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Edge Function: /profit/forecast
// Predict future profits based on weather, crew, materials, season

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
      weather_forecast,
      crew_name,
      materials_available,
      season,
    } = await req.json();

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

    // Get pricing recommendation
    const { data: pricingRec } = await supabase
      .from("pricing_recommendations")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get cost estimates
    const { data: jobCosts } = await supabase
      .from("job_costs")
      .select("*")
      .eq("job_id", job_id)
      .single();

    const revenue = Number(job.contract_value || pricingRec?.recommended_price || 0);
    const materialCost = jobCosts?.materials_cost || 0;
    const laborCost = jobCosts?.labor_cost || 0;
    const equipmentCost = jobCosts?.equipment_cost || 0;
    const baseCost = materialCost + laborCost + equipmentCost;
    const overhead = baseCost * 0.15;
    const totalCost = baseCost + overhead;

    // Base profit projection
    const baseProfit = revenue - totalCost;

    // Get historical crew performance if crew_name provided
    let crewEfficiency = 1.0; // Default 100% efficiency
    if (crew_name) {
      const { data: crewHistory } = await supabase
        .from("profit_analysis")
        .select("actual_profit, estimated_profit")
        .eq("team_id", job.team_id)
        .not("estimated_profit", "is", null)
        .limit(10);

      if (crewHistory && crewHistory.length > 0) {
        const avgEfficiency = crewHistory.reduce((sum, h) => {
          if (h.estimated_profit > 0) {
            return sum + (h.actual_profit / h.estimated_profit);
          }
          return sum;
        }, 0) / crewHistory.length;
        crewEfficiency = Math.max(0.7, Math.min(1.3, avgEfficiency)); // Clamp between 70% and 130%
      }
    }

    // Weather impact
    let weatherImpact = 1.0;
    if (weather_forecast) {
      if (weather_forecast.includes("rain") || weather_forecast.includes("storm")) {
        weatherImpact = 0.85; // 15% reduction due to delays
      } else if (weather_forecast.includes("clear") || weather_forecast.includes("sunny")) {
        weatherImpact = 1.05; // 5% boost
      }
    }

    // Season impact
    let seasonImpact = 1.0;
    const currentSeason = season || new Date().getMonth() < 3 ? "winter" :
      new Date().getMonth() < 6 ? "spring" :
      new Date().getMonth() < 9 ? "summer" : "fall";

    if (currentSeason === "winter") {
      seasonImpact = 0.90; // 10% reduction in winter
    } else if (currentSeason === "summer") {
      seasonImpact = 1.10; // 10% boost in summer
    }

    // Materials availability impact
    let materialsImpact = 1.0;
    if (materials_available === false) {
      materialsImpact = 0.80; // 20% reduction if materials delayed
    }

    // Calculate projected profit
    const projectedProfit = baseProfit * crewEfficiency * weatherImpact * seasonImpact * materialsImpact;

    // Best case (optimistic)
    const bestCaseProfit = baseProfit * 1.15 * weatherImpact * 1.10 * materialsImpact;

    // Worst case (pessimistic)
    const worstCaseProfit = baseProfit * 0.85 * weatherImpact * 0.90 * materialsImpact;

    // Upsell impact
    const { data: upsells } = await supabase
      .from("upsell_suggestions")
      .select("estimated_revenue, estimated_cost")
      .eq("job_id", job_id)
      .eq("status", "accepted");

    const upsellRevenue = upsells?.reduce((sum, u) => sum + (u.estimated_revenue || 0), 0) || 0;
    const upsellCost = upsells?.reduce((sum, u) => sum + (u.estimated_cost || 0), 0) || 0;
    const upsellProfit = upsellRevenue - upsellCost;

    // Final projections
    const expectedProfit = projectedProfit + upsellProfit;
    const bestCaseTotal = bestCaseProfit + upsellProfit;
    const worstCaseTotal = worstCaseProfit + upsellProfit;

    return new Response(
      JSON.stringify({
        success: true,
        job_id,
        revenue,
        cost_breakdown: {
          material: materialCost,
          labor: laborCost,
          equipment: equipmentCost,
          overhead: overhead,
          total: totalCost,
        },
        projections: {
          expected_profit: Math.round(expectedProfit * 100) / 100,
          best_case_profit: Math.round(bestCaseTotal * 100) / 100,
          worst_case_profit: Math.round(worstCaseTotal * 100) / 100,
        },
        factors: {
          crew_efficiency: Math.round(crewEfficiency * 100),
          weather_impact: Math.round(weatherImpact * 100),
          season_impact: Math.round(seasonImpact * 100),
          materials_impact: Math.round(materialsImpact * 100),
        },
        upsell_impact: {
          revenue: upsellRevenue,
          profit: upsellProfit,
        },
        recommendations: {
          priority: expectedProfit > 5000 ? "high" : expectedProfit > 2000 ? "medium" : "low",
          crew_choice: crewEfficiency > 1.0 ? "Good crew choice" : "Consider alternative crew",
          timing: weatherImpact < 0.9 ? "Consider delaying start" : "Good timing",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error forecasting profit:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});





























