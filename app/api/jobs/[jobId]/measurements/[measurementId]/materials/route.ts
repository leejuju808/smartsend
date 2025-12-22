// Block 190000 — SmartSend Roofing AI Roof Measurements v1
// API Route: Generate Materials from Measurement
// POST /api/jobs/[jobId]/measurements/[measurementId]/materials

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ jobId: string; measurementId: string }>;
  }
) {
  try {
    const { jobId, measurementId } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify measurement exists and belongs to job
    const { data: measurement, error: measurementError } =
      await serviceSupabase
        .from("roof_measurements")
        .select("*")
        .eq("id", measurementId)
        .eq("job_id", jobId)
        .single();

    if (measurementError || !measurement) {
      return NextResponse.json(
        { error: "Measurement not found" },
        { status: 404 }
      );
    }

    // Calculate materials using database function
    const { data: materials, error: calcError } = await serviceSupabase.rpc(
      "calculate_roof_materials",
      {
        p_measurement_id: measurementId,
      }
    );

    if (calcError) {
      console.error("Error calculating materials:", calcError);
      return NextResponse.json(
        { error: "Failed to calculate materials", details: calcError.message },
        { status: 500 }
      );
    }

    // Get updated measurement with materials
    const { data: updatedMeasurement } = await serviceSupabase
      .from("roof_measurements")
      .select("*")
      .eq("id", measurementId)
      .single();

    return NextResponse.json({
      success: true,
      materials,
      measurement: updatedMeasurement,
      message: "Materials calculated successfully",
    });
  } catch (error: any) {
    console.error("Error calculating materials:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























