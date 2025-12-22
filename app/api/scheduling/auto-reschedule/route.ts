// Block 242000 — Scheduling Engine v2
// POST /api/scheduling/auto-reschedule
// Automatically reschedule jobs based on weather, conflicts, or other factors

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
    const { job_id, reason, new_date } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = workspaceMember.workspace_id;

    // Get current schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("job_schedule")
      .select("*, job:roofing_jobs(id, address)")
      .eq("job_id", job_id)
      .eq("workspace_id", workspaceId)
      .eq("status", "scheduled")
      .order("scheduled_start", { ascending: true })
      .limit(1)
      .single();

    if (scheduleError || !schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    // Determine new date
    let targetDate = new_date;
    if (!targetDate) {
      // Auto-find next available date
      targetDate = await findNextAvailableDate({
        supabase,
        workspaceId,
        crewId: schedule.crew_id,
        currentDate: new Date(schedule.scheduled_start),
        jobDuration: schedule.estimated_duration_hours || 8,
      });
    }

    if (!targetDate) {
      return NextResponse.json(
        { error: "Could not find available date" },
        { status: 400 }
      );
    }

    const startTime = new Date(targetDate);
    startTime.setHours(7, 0, 0, 0); // Default 7 AM start

    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + (schedule.estimated_duration_hours || 8));

    // Update schedule
    const { data: updatedSchedule, error: updateError } = await supabase
      .from("job_schedule")
      .update({
        scheduled_start: startTime.toISOString(),
        scheduled_end: endTime.toISOString(),
        status: "scheduled",
        notes: schedule.notes 
          ? `${schedule.notes}\n[Auto-rescheduled: ${reason || "Weather delay"}]`
          : `[Auto-rescheduled: ${reason || "Weather delay"}]`,
      })
      .eq("id", schedule.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating schedule:", updateError);
      return NextResponse.json(
        { error: "Failed to reschedule" },
        { status: 500 }
      );
    }

    // Update roofing_jobs table
    await supabase
      .from("roofing_jobs")
      .update({
        scheduled_start_date: startTime.toISOString().split('T')[0],
        scheduled_end_date: endTime.toISOString().split('T')[0],
      })
      .eq("id", job_id);

    // If weather-related, update weather log
    if (reason?.toLowerCase().includes("weather")) {
      await supabase
        .from("weather_log")
        .update({
          delay_required: true,
          delay_reason: reason,
        })
        .eq("job_id", job_id)
        .eq("date", new Date(schedule.scheduled_start).toISOString().split('T')[0]);
    }

    return NextResponse.json({
      success: true,
      schedule: updatedSchedule,
      rescheduled_to: targetDate,
      reason: reason || "Auto-rescheduled",
    });
  } catch (error: any) {
    console.error("Error in auto-reschedule:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function findNextAvailableDate({
  supabase,
  workspaceId,
  crewId,
  currentDate,
  jobDuration,
}: {
  supabase: any;
  workspaceId: string;
  crewId: string;
  currentDate: Date;
  jobDuration: number;
}): Promise<string | null> {
  // Look ahead up to 30 days
  const maxDays = 30;
  const startDate = new Date(currentDate);
  startDate.setDate(startDate.getDate() + 1); // Start from tomorrow

  for (let i = 0; i < maxDays; i++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(startDate.getDate() + i);
    const dateStr = checkDate.toISOString().split('T')[0];

    // Check crew availability
    const { data: availability } = await supabase
      .from("crew_availability")
      .select("is_available")
      .eq("crew_id", crewId)
      .eq("date", dateStr)
      .single();

    if (availability && !availability.is_available) {
      continue; // Crew not available
    }

    // Check for conflicts
    const startTime = new Date(checkDate);
    startTime.setHours(7, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + jobDuration);

    const { data: conflicts } = await supabase
      .from("job_schedule")
      .select("id")
      .eq("crew_id", crewId)
      .eq("workspace_id", workspaceId)
      .in("status", ["scheduled", "in_progress"])
      .or(`scheduled_start.lte.${endTime.toISOString()},scheduled_end.gte.${startTime.toISOString()}`);

    if (!conflicts || conflicts.length === 0) {
      return dateStr; // Found available date
    }
  }

  return null; // No available date found
}

























