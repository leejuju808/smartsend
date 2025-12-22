// Block 41200 — SmartSend Roofing "AI Roof Measurement + Diagram Engine" v1
// API Route: Sync Measurement to Proposal and Materials
// POST /api/jobs/[jobId]/sync-measurement

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    // Verify authentication
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

    // Get latest measurement
    const { data: measurement, error: measurementError } = await supabase
      .from("roof_measurements")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (measurementError || !measurement) {
      return NextResponse.json(
        { error: "No measurement found for this job" },
        { status: 404 }
      );
    }

    // Get material estimates
    const { data: materials, error: materialsError } = await supabase
      .from("roof_material_estimates")
      .select("*")
      .eq("measurement_id", measurement.id);

    if (materialsError) {
      console.error("Error fetching materials:", materialsError);
    }

    // Find associated proposal
    const { data: proposals, error: proposalsError } = await supabase
      .from("proposals")
      .select("id, job_id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (proposalsError) {
      console.error("Error fetching proposals:", proposalsError);
    }

    // Update proposal with measurement data if exists
    if (proposals && proposals.length > 0) {
      const proposal = proposals[0];
      
      // Update proposal metadata with measurement info
      const { error: updateError } = await supabase
        .from("proposals")
        .update({
          quote_data: {
            ...(proposal.quote_data || {}),
            squares: measurement.squares,
            pitch: measurement.pitch,
            measurement_id: measurement.id,
            measurement_confidence: measurement.confidence,
          },
        })
        .eq("id", proposal.id);

      if (updateError) {
        console.error("Error updating proposal:", updateError);
      }
    }

    // Sync materials to job_materials table
    if (materials && materials.length > 0) {
      for (const material of materials) {
        // Check if material already exists
        const { data: existing } = await supabase
          .from("job_materials")
          .select("id")
          .eq("job_id", jobId)
          .eq("material_type", material.material_type)
          .single();

        if (!existing) {
          // Insert new material
          await supabase.from("job_materials").insert({
            job_id: jobId,
            material_type: material.material_type,
            notes: `Auto-calculated from roof measurement: ${material.quantity} ${material.unit}`,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Measurement synced to proposal and materials",
      proposal_updated: proposals && proposals.length > 0,
      materials_synced: materials?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in sync-measurement API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































