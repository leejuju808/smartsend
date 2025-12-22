// Block 254000 — SmartSend Productivity Engine v1
// API Route: Get Install Speed Metrics for a Job
// GET /api/productivity/jobs/[jobId]/speed?workspace_id=xxx

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

    // Get install speed metrics
    const { data: speedMetrics, error: speedError } = await supabase.rpc(
      "calculate_install_speed_metrics",
      {
        p_job_id: jobId,
      }
    );

    if (speedError) {
      console.error("Error calculating speed metrics:", speedError);
      return NextResponse.json(
        { error: "Failed to calculate speed metrics" },
        { status: 500 }
      );
    }

    // Get task durations
    const { data: taskDurations, error: durationsError } = await supabase
      .from("job_task_durations")
      .select(
        `
        id,
        task_name,
        start_time,
        end_time,
        duration_minutes,
        baseline_duration_minutes,
        variance_percent
      `
      )
      .eq("job_id", jobId)
      .order("start_time", { ascending: true });

    // Calculate total duration
    const totalMinutes =
      taskDurations?.reduce((sum, task) => sum + (task.duration_minutes || 0), 0) ||
      0;
    const totalHours = (totalMinutes / 60).toFixed(1);

    // Calculate crew speed rating (average of all task speed ratings)
    const avgSpeedRating =
      speedMetrics && speedMetrics.length > 0
        ? Math.round(
            speedMetrics.reduce((sum, m) => sum + (m.speed_rating || 0), 0) /
              speedMetrics.length
          )
        : 0;

    return NextResponse.json({
      success: true,
      job_id: jobId,
      total_duration: {
        hours: parseFloat(totalHours),
        minutes: totalMinutes,
      },
      crew_speed_rating: avgSpeedRating,
      task_metrics: speedMetrics || [],
      task_durations: taskDurations || [],
    });
  } catch (error: any) {
    console.error("Error in job speed metrics route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























