// Block 19950 — SmartSend Roof Measurement AI v1
// POST /api/roof-measurements/analyze
// Analyzes roof photos and extracts measurement data (size, pitch, complexity, age, cost)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { analyzeRoofMeasurementWithAI } from "@/lib/ai/roofMeasurement";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, attachmentId, imageUrl, contactId } = body;

    if (!threadId || (!attachmentId && !imageUrl)) {
      return NextResponse.json(
        { error: "threadId and either attachmentId or imageUrl are required" },
        { status: 400 }
      );
    }

    // Get thread and workspace
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, contact_id, campaign_id")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Get workspace_id from campaign or contact
    let workspaceId: string | null = null;
    if (thread.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("workspace_id")
        .eq("id", thread.contact_id)
        .single();
      workspaceId = contact?.workspace_id || null;
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Get image URL
    let finalImageUrl = imageUrl;
    if (attachmentId && !imageUrl) {
      const { data: attachment, error: attachError } = await supabase
        .from("attachments")
        .select("storage_path, file_type")
        .eq("id", attachmentId)
        .single();

      if (attachError || !attachment) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
      }

      if (!attachment.file_type.startsWith("image/")) {
        return NextResponse.json({ error: "File is not an image" }, { status: 400 });
      }

      const { data: urlData } = await supabase.storage
        .from("attachments")
        .createSignedUrl(attachment.storage_path, 3600);

      if (!urlData?.signedUrl) {
        return NextResponse.json({ error: "Failed to generate image URL" }, { status: 500 });
      }

      finalImageUrl = urlData.signedUrl;
    }

    // Analyze roof measurement with AI
    const measurement = await analyzeRoofMeasurementWithAI(finalImageUrl);

    // Get existing measurement for this thread (if any)
    const { data: existingMeasurement } = await supabase
      .from("roof_measurements")
      .select("*")
      .eq("thread_id", threadId)
      .maybeSingle();

    // Prepare roof measurement record
    const measurementData: any = {
      thread_id: threadId,
      contact_id: thread.contact_id || contactId || null,
      workspace_id: workspaceId,
      attachment_id: attachmentId || null,
      estimated_squares_min: measurement.estimatedSquaresMin,
      estimated_squares_max: measurement.estimatedSquaresMax,
      estimated_squares_avg: measurement.estimatedSquaresAvg,
      pitch_estimate: measurement.pitchEstimate,
      pitch_category: measurement.pitchCategory,
      material_type: measurement.materialType,
      complexity_rating: measurement.complexityRating,
      dormers_detected: measurement.dormersDetected,
      chimneys_detected: measurement.chimneysDetected,
      skylights_detected: measurement.skylightsDetected,
      multi_plane_complexity: measurement.multiPlaneComplexity,
      steep_slopes_detected: measurement.steepSlopesDetected,
      flashing_heavy_sections: measurement.flashingHeavySections,
      penetrations_count: measurement.penetrationsCount,
      confidence_score: measurement.confidenceScore,
      image_quality_score: measurement.imageQualityScore,
      angle_score: measurement.angleScore,
      clarity_score: measurement.clarityScore,
      visibility_score: measurement.visibilityScore,
      obstruction_level: measurement.obstructionLevel,
      quality_feedback: measurement.qualityFeedback,
      likely_job_type: measurement.likelyJobType,
      replacement_reasons: measurement.replacementReasons,
      repair_reasons: measurement.repairReasons,
      roof_age_min: measurement.roofAgeMin,
      roof_age_max: measurement.roofAgeMax,
      roof_age_median: measurement.roofAgeMedian,
      condition_assessment: measurement.conditionAssessment,
      granule_wear_detected: measurement.granuleWearDetected,
      color_fading_detected: measurement.colorFadingDetected,
      algae_moss_detected: measurement.algaeMossDetected,
      warping_detected: measurement.warpingDetected,
      cracking_detected: measurement.crackingDetected,
      curling_detected: measurement.curlingDetected,
      ai_analysis_metadata: measurement.analysisMetadata,
      analyzed_at: new Date().toISOString(),
    };

    // Upsert measurement
    let result;
    if (existingMeasurement) {
      const { data, error } = await supabase
        .from("roof_measurements")
        .update(measurementData)
        .eq("id", existingMeasurement.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating roof measurement:", error);
        return NextResponse.json({ error: "Failed to update measurement" }, { status: 500 });
      }

      result = data;
    } else {
      const { data, error } = await supabase
        .from("roof_measurements")
        .insert(measurementData)
        .select()
        .single();

      if (error) {
        console.error("Error creating roof measurement:", error);
        return NextResponse.json({ error: "Failed to create measurement" }, { status: 500 });
      }

      result = data;
    }

    // Calculate replacement cost
    if (result && result.id) {
      await supabase.rpc("calculate_replacement_cost_from_measurements", {
        p_measurement_id: result.id,
      });

      // Determine job type
      await supabase.rpc("determine_job_type_from_measurements", {
        p_measurement_id: result.id,
      });

      // Refresh measurement with calculated values
      const { data: updatedMeasurement } = await supabase
        .from("roof_measurements")
        .select("*")
        .eq("id", result.id)
        .single();

      return NextResponse.json({
        success: true,
        measurement: updatedMeasurement,
      });
    }

    return NextResponse.json({
      success: true,
      measurement: result,
    });
  } catch (error: any) {
    console.error("Error analyzing roof measurement:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze roof measurement" },
      { status: 500 }
    );
  }
}



















































