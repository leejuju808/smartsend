// Block 224000 — SmartSend Roofing Production Calendar: Move Job (Drag-and-Drop)
// POST /api/production/move
// Moves a scheduled job to a new date with validation

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

    const { schedule_id, new_date, crew_id } = await req.json();

    // Validate required fields
    if (!schedule_id || !new_date) {
      return NextResponse.json(
        { error: "schedule_id and new_date are required" },
        { status: 400 }
      );
    }

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json(
        { error: "No workspace access" },
        { status: 403 }
      );
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Get existing schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("job_schedule")
      .select("*, job_id, crew_id, workspace_id, company_id")
      .eq("id", schedule_id)
      .single();

    if (scheduleError || !schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    if (schedule.workspace_id && !workspaceIds.includes(schedule.workspace_id)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const targetCrewId = crew_id || schedule.crew_id;
    if (!targetCrewId) {
      return NextResponse.json(
        { error: "No crew assigned to move job" },
        { status: 400 }
      );
    }

    // Check job readiness
    const { data: readiness } = await supabase
      .rpc("check_job_readiness", { p_job_id: schedule.job_id });

    if (readiness && readiness.length > 0 && !readiness[0].is_ready) {
      return NextResponse.json(
        {
          error: "Job not ready for scheduling",
          readiness_issues: readiness[0].readiness_issues,
        },
        { status: 400 }
      );
    }

    // Check crew availability on new date
    const { data: availability } = await supabase
      .rpc("check_crew_availability", {
        p_crew_id: targetCrewId,
        p_date: new_date,
      });

    if (availability && availability.length > 0 && !availability[0].is_available) {
      return NextResponse.json(
        {
          error: "Crew not available on new date",
          reason: availability[0].reason,
          is_booked: availability[0].is_booked,
        },
        { status: 400 }
      );
    }

    // Update schedule
    const oldDate = schedule.scheduled_date;
    const { data: updated, error: updateError } = await supabase
      .from("job_schedule")
      .update({
        scheduled_date: new_date,
        crew_id: targetCrewId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", schedule_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to move job", details: updateError.message },
        { status: 500 }
      );
    }

    // Create schedule event
    await supabase.from("schedule_events").insert({
      job_id: schedule.job_id,
      job_schedule_id: schedule_id,
      workspace_id: schedule.workspace_id,
      company_id: schedule.company_id,
      event_type: "job_moved",
      notes: `Job moved from ${oldDate} to ${new_date}`,
      metadata: {
        old_date: oldDate,
        new_date,
        crew_id: targetCrewId,
      },
    });

    // TODO: Update crew's mobile app notification (future block)

    return NextResponse.json({
      success: true,
      schedule: updated,
      message: "Job moved successfully",
    });
  } catch (error: any) {
    console.error("Move job API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

























