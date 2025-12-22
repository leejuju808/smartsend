// Block 49000 — SmartSend Roofing Safety Compliance v1
// API Route: Generate Safety Score
// POST /api/safety/generate-score
// Triggered after checklist submitted or safety photos uploaded

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const { job_id } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
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

    // Calculate safety score
    const { data: score, error: scoreError } = await supabase.rpc(
      "calculate_safety_score",
      { p_job_id: job_id }
    );

    if (scoreError) {
      console.error("Error calculating safety score:", scoreError);
      return NextResponse.json(
        { error: "Failed to calculate safety score" },
        { status: 500 }
      );
    }

    // Get the safety score record
    const { data: safetyScore, error: fetchError } = await supabase
      .from("safety_scores")
      .select("*")
      .eq("job_id", job_id)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching safety score:", fetchError);
    }

    // Check if score is low and alert hasn't been sent
    if (safetyScore && score < 80 && !safetyScore.low_score_alert_sent) {
      // Update alert status
      await supabase
        .from("safety_scores")
        .update({
          low_score_alert_sent: true,
          low_score_alert_sent_at: new Date().toISOString(),
        })
        .eq("job_id", job_id);

      // TODO: Send alert to owner (email/webhook)
    }

    return NextResponse.json({
      success: true,
      score: score || 0,
      safety_score: safetyScore,
      message: "Safety score calculated successfully",
    });
  } catch (error: any) {
    console.error("Error in generate safety score API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































