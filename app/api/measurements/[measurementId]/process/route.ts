// Block 25900 — SmartSend Roof Measurement Integrations v1
// API Route: POST /api/measurements/[measurementId]/process
// Processes a measurement source and extracts measurement data
// This would typically be called by a background job after PDF parsing

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ measurementId: string }> }
) {
  try {
    const { measurementId } = await params;
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
      total_squares,
      pitch_value,
      pitch_category,
      facets_count,
      ridges_linear_ft,
      valleys_linear_ft,
      rakes_linear_ft,
      eaves_linear_ft,
      waste_factor_percent,
      complexity_rating,
      material_type,
      // Additional fields
      roof_area_sqft,
      has_dormers,
      has_chimneys,
      has_skylights,
      penetrations_count,
      raw_data,
    } = body;

    // Get measurement source
    const { data: measurementSource, error: sourceError } = await supabase
      .from("measurement_sources")
      .select("*")
      .eq("id", measurementId)
      .single();

    if (sourceError || !measurementSource) {
      return NextResponse.json(
        { error: "Measurement source not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", measurementSource.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Create or update measurement data
    const measurementData = {
      measurement_source_id: measurementId,
      workspace_id: measurementSource.workspace_id,
      job_id: measurementSource.job_id,
      lead_id: measurementSource.lead_id,
      total_squares: total_squares || null,
      pitch_value: pitch_value || null,
      pitch_category: pitch_category || 'medium',
      facets_count: facets_count || 0,
      ridges_linear_ft: ridges_linear_ft || null,
      valleys_linear_ft: valleys_linear_ft || null,
      rakes_linear_ft: rakes_linear_ft || null,
      eaves_linear_ft: eaves_linear_ft || null,
      waste_factor_percent: waste_factor_percent || 12.0,
      complexity_rating: complexity_rating || 'medium',
      material_type: material_type || 'asphalt',
      roof_area_sqft: roof_area_sqft || null,
      has_dormers: has_dormers || false,
      has_chimneys: has_chimneys || false,
      has_skylights: has_skylights || false,
      penetrations_count: penetrations_count || 0,
      raw_data: raw_data || {},
      is_primary: false, // Will be set to true if this is the first measurement for the job
      is_verified: false,
    };

    // Check if this should be the primary measurement
    if (measurementSource.job_id) {
      const { data: existingPrimary } = await supabase
        .from("roof_measurement_data")
        .select("id")
        .eq("job_id", measurementSource.job_id)
        .eq("is_primary", true)
        .single();

      if (!existingPrimary) {
        measurementData.is_primary = true;
      }
    }

    const { data: measurementDataRecord, error: dataError } = await supabase
      .from("roof_measurement_data")
      .insert(measurementData)
      .select()
      .single();

    if (dataError) {
      console.error("Error creating measurement data:", dataError);
      return NextResponse.json(
        { error: "Failed to create measurement data" },
        { status: 500 }
      );
    }

    // Update measurement source status
    await supabase
      .from("measurement_sources")
      .update({
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq("id", measurementId);

    // Auto-generate material list if this is primary measurement
    if (measurementDataRecord.is_primary) {
      const { error: materialError } = await supabase.rpc(
        'generate_material_list',
        { p_measurement_data_id: measurementDataRecord.id }
      );

      if (materialError) {
        console.error("Error generating material list:", materialError);
        // Don't fail the request, just log the error
      }
    }

    return NextResponse.json({
      success: true,
      measurement_data: measurementDataRecord,
    });
  } catch (error: any) {
    console.error("Error in POST /api/measurements/[measurementId]/process:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































