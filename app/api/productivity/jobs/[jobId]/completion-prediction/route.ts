// Block 254000 — SmartSend Productivity Engine v1
// API Route: Get Predicted Job Completion Time
// GET /api/productivity/jobs/[jobId]/completion-prediction?workspace_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get predicted completion time
    const { data: prediction, error: predictionError } = await supabase.rpc(
      "predict_job_completion_time",
      {
        p_job_id: jobId,
      }
    );

    if (predictionError) {
      console.error("Error predicting completion:", predictionError);
      return NextResponse.json(
        { error: "Failed to predict completion time" },
        { status: 500 }
      );
    }

    const predictionData = prediction?.[0] || null;

    if (!predictionData) {
      return NextResponse.json({
        success: true,
        prediction: null,
        message: "Insufficient data to predict completion time",
      });
    }

    return NextResponse.json({
      success: true,
      job_id: jobId,
      prediction: {
        estimated_completion: predictionData.estimated_completion,
        original_plan: predictionData.original_plan,
        forecasted_delay_minutes: predictionData.forecasted_delay_minutes,
        forecasted_delay_hours: Math.round(
          (predictionData.forecasted_delay_minutes || 0) / 60
        ),
        confidence_score: predictionData.confidence_score,
        is_delayed:
          (predictionData.forecasted_delay_minutes || 0) > 0,
      },
    });
  } catch (error: any) {
    console.error("Error in completion prediction route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























