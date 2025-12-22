// Block 25900 — SmartSend Roof Measurement Integrations v1
// API Route: POST /api/jobs/[jobId]/measurements/generate-materials
// Generates material list for a job's primary measurement

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
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

    // Get job to verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id, primary_measurement_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
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

    // Get primary measurement
    let measurementDataId = job.primary_measurement_id;

    if (!measurementDataId) {
      // Find primary measurement
      const { data: primaryMeasurement } = await supabase
        .from("roof_measurement_data")
        .select("id")
        .eq("job_id", jobId)
        .eq("is_primary", true)
        .single();

      if (!primaryMeasurement) {
        return NextResponse.json(
          { error: "No primary measurement found for this job" },
          { status: 404 }
        );
      }

      measurementDataId = primaryMeasurement.id;
    }

    // Generate material list
    const { data: materialList, error: materialError } = await supabase.rpc(
      'generate_material_list',
      { p_measurement_data_id: measurementDataId }
    );

    if (materialError) {
      console.error("Error generating material list:", materialError);
      return NextResponse.json(
        { error: "Failed to generate material list" },
        { status: 500 }
      );
    }

    // Get the generated materials
    const { data: materials, error: fetchError } = await supabase
      .from("auto_calculated_materials")
      .select("*")
      .eq("measurement_data_id", measurementDataId)
      .order("material_type");

    if (fetchError) {
      console.error("Error fetching materials:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch generated materials" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      material_list: materialList,
      materials: materials || [],
    });
  } catch (error: any) {
    console.error("Error in POST /api/jobs/[jobId]/measurements/generate-materials:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































