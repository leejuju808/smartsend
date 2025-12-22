// Block 62000 — SmartSend Roofing Material Forecasting Engine v1
// Edge Function: /materials-forecast
// 
// Inputs job details → outputs material list + quantities
// AI-powered forecasting based on roof size, pitch, layers, shingle type, etc.

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
    const { job_id, roof_squares, roof_pitch, number_of_layers, shingle_type, ridge_type, underlayment_type, decking_replacement_probability, waste_factor } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("*")
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

    // Use provided values or fall back to job data
    const squares = roof_squares ?? job.roof_squares ?? 0;
    const pitch = roof_pitch ?? job.roof_pitch ?? 6.0;
    const layers = number_of_layers ?? 1;
    const shingleType = shingle_type ?? "architectural";
    const ridgeType = ridge_type ?? "ridge_cap";
    const underlaymentType = underlayment_type ?? "synthetic";
    const deckingProb = decking_replacement_probability ?? job.decking_replacement_squares ? 0.3 : 0;
    const waste = waste_factor ?? 0.12;

    // Calculate forecast using database function
    const { data: forecastResult, error: forecastError } = await supabase
      .rpc("calculate_material_forecast", { p_job_id: job_id });

    if (forecastError) {
      console.error("Forecast calculation error:", forecastError);
      // Fall back to manual calculation
    }

    // Build forecast object
    const adjustedWaste = waste + (pitch > 8 ? 0.03 : 0) + (job.complexity_factor > 1.0 ? 0.02 : 0);
    const shingleBundles = Math.ceil((squares * (1 + adjustedWaste)) * 3);
    const ridgeBundles = Math.max(Math.ceil(squares / 5.0), 2);
    const underlaymentRolls = Math.ceil((squares * (1 + adjustedWaste)) / 10.0);
    const iceWaterShieldRolls = Math.max(Math.ceil(squares / 18.0), 2);
    const starterBundles = Math.ceil(squares / 10.0);
    const plywoodSheets = Math.ceil((job.decking_replacement_squares ?? 0) * 3.33);

    const forecast = {
      shingles: {
        bundles: shingleBundles,
        squares: squares,
        waste_factor: adjustedWaste,
        type: shingleType
      },
      ridge_cap: {
        bundles: ridgeBundles,
        type: ridgeType
      },
      underlayment: {
        rolls: underlaymentRolls,
        type: underlaymentType
      },
      ice_water_shield: {
        rolls: iceWaterShieldRolls
      },
      starter_strip: {
        bundles: starterBundles
      },
      nails: {
        boxes: 1
      },
      flashing: {
        linear_feet: Math.ceil(squares * 8)
      },
      vents: {
        pieces: Math.max(Math.ceil(squares / 2.0), 4)
      },
      plywood: {
        sheets: plywoodSheets
      }
    };

    // Calculate total cost (if material_costs exist)
    const { data: materialCosts } = await supabase
      .from("material_costs")
      .select("*")
      .eq("workspace_id", job.workspace_id);

    let totalCost = 0;
    if (materialCosts) {
      const costMap = new Map(materialCosts.map(c => [`${c.item_name}_${c.unit}`, c.unit_cost]));
      
      totalCost += (costMap.get("Shingles_bundles") ?? 45) * shingleBundles;
      totalCost += (costMap.get("Ridge Cap_bundles") ?? 35) * ridgeBundles;
      totalCost += (costMap.get("Underlayment_rolls") ?? 120) * underlaymentRolls;
      totalCost += (costMap.get("Ice & Water Shield_rolls") ?? 85) * iceWaterShieldRolls;
      totalCost += (costMap.get("Starter Strip_bundles") ?? 25) * starterBundles;
      totalCost += (costMap.get("Nails_boxes") ?? 25) * 1;
      totalCost += (costMap.get("Flashing_linear_feet") ?? 2.5) * Math.ceil(squares * 8);
      totalCost += (costMap.get("Vents_pieces") ?? 15) * Math.max(Math.ceil(squares / 2.0), 4);
      totalCost += (costMap.get("Plywood_sheets") ?? 45) * plywoodSheets;
    }

    // Create or update forecast record
    const { data: existingForecast } = await supabase
      .from("material_forecasts")
      .select("id")
      .eq("job_id", job_id)
      .single();

    const forecastData = {
      job_id: job_id,
      workspace_id: job.workspace_id,
      forecast: forecast,
      roof_squares: squares,
      roof_pitch: pitch,
      number_of_layers: layers,
      shingle_type: shingleType,
      ridge_type: ridgeType,
      underlayment_type: underlaymentType,
      decking_replacement_probability: deckingProb,
      waste_factor: adjustedWaste,
      total_forecasted_cost: totalCost,
      updated_at: new Date().toISOString()
    };

    let forecastId;
    if (existingForecast) {
      const { data, error } = await supabase
        .from("material_forecasts")
        .update(forecastData)
        .eq("id", existingForecast.id)
        .select("id")
        .single();
      
      if (error) throw error;
      forecastId = data.id;
    } else {
      const { data, error } = await supabase
        .from("material_forecasts")
        .insert(forecastData)
        .select("id")
        .single();
      
      if (error) throw error;
      forecastId = data.id;
    }

    return new Response(
      JSON.stringify({
        success: true,
        forecast_id: forecastId,
        forecast: forecast,
        total_cost: totalCost,
        waste_factor: adjustedWaste,
        decking_probability: deckingProb
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in materials-forecast:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





























