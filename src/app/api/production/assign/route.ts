// Block 224000 — SmartSend Roofing Production Calendar: Assign Crew to Job
// POST /api/production/assign
// Assigns a crew to a job on a specific date with validation

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

    const { job_id, crew_id, scheduled_date, notes } = await req.json();

    // Validate required fields
    if (!job_id || !crew_id || !scheduled_date) {
      return NextResponse.json(
        { error: "job_id, crew_id, and scheduled_date are required" },
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

    // Get job to find workspace_id
    let job: any = null;
    const { data: roofingJob, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id, company_id")
      .eq("id", job_id)
      .single();

    if (jobError || !roofingJob) {
      // Try jobs table as fallback
      const { data: jobAlt } = await supabase
        .from("jobs")
        .select("workspace_id, company_id")
        .eq("id", job_id)
        .single();

      if (!jobAlt) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      job = jobAlt;
    } else {
      job = roofingJob;
    }

    // Check workspace access
    if (job.workspace_id && !workspaceIds.includes(job.workspace_id)) {
      return NextResponse.json(
        { error: "Access denied to this job" },
        { status: 403 }
      );
    }

    const workspaceId = job.workspace_id || workspaceIds[0];

    // Check job readiness (materials + deposit)
    const { data: readiness, error: readinessError } = await supabase
      .rpc("check_job_readiness", { p_job_id: job_id });

    if (readinessError) {
      console.error("Error checking job readiness:", readinessError);
    } else if (readiness && readiness.length > 0 && !readiness[0].is_ready) {
      return NextResponse.json(
        {
          error: "Job not ready for scheduling",
          readiness_issues: readiness[0].readiness_issues,
          materials_status: readiness[0].materials_status,
          deposit_status: readiness[0].deposit_status,
        },
        { status: 400 }
      );
    }

    // Check crew availability
    const { data: availability, error: availabilityError } = await supabase
      .rpc("check_crew_availability", {
        p_crew_id: crew_id,
        p_date: scheduled_date,
      });

    if (availabilityError) {
      console.error("Error checking crew availability:", availabilityError);
    } else if (availability && availability.length > 0 && !availability[0].is_available) {
      return NextResponse.json(
        {
          error: "Crew not available",
          reason: availability[0].reason,
          is_booked: availability[0].is_booked,
        },
        { status: 400 }
      );
    }

    // Check if job is already scheduled on this date
    const { data: existingSchedule } = await supabase
      .from("job_schedule")
      .select("id, crew_id")
      .eq("job_id", job_id)
      .eq("scheduled_date", scheduled_date)
      .in("status", ["scheduled", "in_progress"])
      .maybeSingle();

    let scheduleId;
    if (existingSchedule) {
      // Update existing schedule
      const { data: updated, error: updateError } = await supabase
        .from("job_schedule")
        .update({
          crew_id,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSchedule.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update schedule", details: updateError.message },
          { status: 500 }
        );
      }

      scheduleId = updated.id;
    } else {
      // Create new schedule
      const { data: newSchedule, error: insertError } = await supabase
        .from("job_schedule")
        .insert({
          job_id,
          crew_id,
          workspace_id: workspaceId,
          company_id: job?.company_id,
          scheduled_date,
          status: "scheduled",
          notes,
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json(
          { error: "Failed to create schedule", details: insertError.message },
          { status: 500 }
        );
      }

      scheduleId = newSchedule.id;
    }

    // Create schedule event
    await supabase.from("schedule_events").insert({
      job_id,
      job_schedule_id: scheduleId,
      workspace_id: workspaceId,
      company_id: job.company_id,
      event_type: existingSchedule ? "crew_reassigned" : "job_scheduled",
      notes: existingSchedule
        ? `Crew reassigned to ${crew_id}`
        : `Job scheduled for ${scheduled_date}`,
      metadata: {
        crew_id,
        scheduled_date,
      },
    });

    // TODO: Push assignment to Crew App (future block)
    // await sendPushNotification(crew_id, `New job scheduled for ${scheduled_date}`);

    return NextResponse.json({
      success: true,
      schedule_id: scheduleId,
      message: existingSchedule ? "Schedule updated" : "Job scheduled successfully",
    });
  } catch (error: any) {
    console.error("Assign crew API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

























