// Block 62000 — SmartSend Roofing Material Forecasting API
// POST /api/materials/forecast
// 
// Inputs job details → outputs material list + quantities using AI forecasting engine

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      job_id,
      roof_squares,
      roof_pitch,
      number_of_layers = 1,
      shingle_type = "architectural",
      ridge_type = "ridge_cap",
      underlayment_type = "synthetic",
      decking_probability = 0,
      waste_factor = 12.0,
      historical_averages,
    } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "Missing job_id" },
        { status: 400 }
      );
    }

    // Verify user has access to this job
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Call the forecasting function
    const { data: forecastId, error: forecastError } = await supabase.rpc(
      "forecast_material_needs",
      {
        p_job_id: job_id,
        p_roof_squares: roof_squares || null,
        p_roof_pitch: roof_pitch || null,
        p_number_of_layers: number_of_layers,
        p_shingle_type: shingle_type,
        p_ridge_type: ridge_type,
        p_underlayment_type: underlayment_type,
        p_decking_probability: decking_probability,
        p_waste_factor: waste_factor,
        p_historical_averages: historical_averages || null,
      }
    );

    if (forecastError) {
      console.error("Forecast error:", forecastError);
      return NextResponse.json(
        { error: forecastError.message || "Failed to generate forecast" },
        { status: 500 }
      );
    }

    // Fetch the created forecast
    const { data: forecast, error: fetchError } = await supabase
      .from("material_forecasts")
      .select("*")
      .eq("id", forecastId)
      .single();

    if (fetchError || !forecast) {
      return NextResponse.json(
        { error: "Forecast created but could not be retrieved" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      forecast_id: forecastId,
      forecast: forecast,
    });
  } catch (error: any) {
    console.error("Error in POST /api/materials/forecast:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
