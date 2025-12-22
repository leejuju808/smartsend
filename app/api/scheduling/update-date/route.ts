// Block 22380 — SmartSend Roofing Job Scheduling Board v1
// API Route: Update Job Scheduling Date
// POST /api/scheduling/update-date

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
    const { job_id, new_start_date } = body;

    if (!job_id || !new_start_date) {
      return NextResponse.json(
        { error: "Missing job_id or new_start_date" },
        { status: 400 }
      );
    }

    // Verify job belongs to user's workspace
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id, scheduled_duration_days")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Block 25260: Check material readiness before scheduling
    const { data: materialCheck, error: materialCheckError } = await supabase.rpc(
      "check_material_readiness_for_scheduling",
      {
        p_job_id: job_id,
      }
    );

    if (!materialCheckError && materialCheck && !materialCheck.ready) {
      return NextResponse.json(
        {
          error: "Cannot schedule job - materials not ready",
          material_blocking: true,
          reason: materialCheck.reason,
          details: materialCheck,
        },
        { status: 409 } // Conflict status
      );
    }

    // Calculate end date based on duration
    const duration = job.scheduled_duration_days || 1;
    const startDate = new Date(new_start_date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration - 1);
    const new_end_date = endDate.toISOString().slice(0, 10);

    // Update job dates and status
    const { error: updateError } = await supabase
      .from("roofing_jobs")
      .update({
        scheduled_start_date: new_start_date,
        scheduled_end_date: new_end_date,
        status: "scheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    if (updateError) {
      console.error("Error updating job:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update job" },
        { status: 500 }
      );
    }

    // Log timeline event
    await supabase.from("job_timeline").insert({
      job_id,
      event_type: "rescheduled",
      description: `Job rescheduled to ${new_start_date}`,
      metadata: {
        old_start_date: job.scheduled_start_date,
        new_start_date: new_start_date,
        duration_days: duration,
      },
    });

    return NextResponse.json(
      { success: true },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in update-date API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




