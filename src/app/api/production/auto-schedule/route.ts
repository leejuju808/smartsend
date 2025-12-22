// Block 38390 — SmartSend Roofing Production Calendar Auto-Schedule API
// POST /api/production/auto-schedule
// Automatically schedules a job to the best available crew

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

    const { job_id, workspace_id } = await req.json();

    if (!job_id || !workspace_id) {
      return NextResponse.json(
        { error: "job_id and workspace_id are required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied to workspace" },
        { status: 403 }
      );
    }

    // Call the database function to auto-schedule
    const { data: result, error } = await supabase.rpc("auto_schedule_job", {
      p_job_id: job_id,
      p_workspace_id: workspace_id,
    });

    if (error) {
      console.error("Auto-schedule error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to auto-schedule job" },
        { status: 500 }
      );
    }

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: "No schedule created. Check job requirements." },
        { status: 400 }
      );
    }

    const scheduleResult = result[0];

    return NextResponse.json({
      success: scheduleResult.scheduled,
      schedule: {
        id: scheduleResult.schedule_id,
        crew_id: scheduleResult.crew_id,
        crew_name: scheduleResult.crew_name,
        start_date: scheduleResult.start_date,
        end_date: scheduleResult.end_date,
        estimated_days: scheduleResult.estimated_days,
      },
      message: scheduleResult.message,
    });
  } catch (error: any) {
    console.error("Auto-schedule API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
































