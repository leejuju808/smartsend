// Block 242000 — Scheduling Engine v2
// POST /api/scheduling/assign
// Assign crew to job with scheduling

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
    const { job_id, crew_id, scheduled_start, scheduled_end, priority, notes } = body;

    if (!job_id || !crew_id || !scheduled_start) {
      return NextResponse.json(
        { error: "job_id, crew_id, and scheduled_start are required" },
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

    // Verify job exists and belongs to workspace
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, address")
      .eq("id", job_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify crew exists
    const { data: crew, error: crewError } = await supabase
      .from("crews")
      .select("id, workspace_id")
      .eq("id", crew_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (crewError || !crew) {
      return NextResponse.json(
        { error: "Crew not found" },
        { status: 404 }
      );
    }

    // Check for scheduling conflicts
    const startTime = new Date(scheduled_start);
    const endTime = scheduled_end ? new Date(scheduled_end) : new Date(startTime.getTime() + 8 * 60 * 60 * 1000); // Default 8 hours

    const { data: conflicts, error: conflictError } = await supabase
      .from("job_schedule")
      .select("id")
      .eq("crew_id", crew_id)
      .eq("workspace_id", workspaceId)
      .in("status", ["scheduled", "in_progress"])
      .or(`scheduled_start.lte.${endTime.toISOString()},scheduled_end.gte.${startTime.toISOString()}`);

    if (conflictError) {
      console.error("Error checking conflicts:", conflictError);
    }

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { 
          error: "Scheduling conflict detected",
          conflicts: conflicts.map((c: any) => c.id)
        },
        { status: 409 }
      );
    }

    // Calculate estimated duration
    const { data: jobDetails } = await supabase
      .from("roofing_jobs")
      .select("roof_squares, complexity_factor")
      .eq("id", job_id)
      .single();

    const estimatedDuration = calculateJobDuration(jobDetails);

    // Create job schedule entry
    const { data: schedule, error: scheduleError } = await supabase
      .from("job_schedule")
      .insert({
        workspace_id: workspaceId,
        job_id,
        crew_id,
        scheduled_start: startTime.toISOString(),
        scheduled_end: endTime.toISOString(),
        estimated_duration_hours: estimatedDuration,
        priority: priority || 5,
        notes,
        status: "scheduled",
        created_by: user.id,
      })
      .select()
      .single();

    if (scheduleError) {
      console.error("Error creating schedule:", scheduleError);
      return NextResponse.json(
        { error: "Failed to create schedule" },
        { status: 500 }
      );
    }

    // Update roofing_jobs table
    await supabase
      .from("roofing_jobs")
      .update({
        scheduled_start_date: startTime.toISOString().split('T')[0],
        scheduled_end_date: endTime.toISOString().split('T')[0],
        status: "scheduled",
      })
      .eq("id", job_id);

    return NextResponse.json({
      success: true,
      schedule,
    });
  } catch (error: any) {
    console.error("Error in scheduling assign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function calculateJobDuration(jobDetails: any): number {
  if (!jobDetails) return 8; // Default 8 hours

  const baseHoursPerSquare = 0.5;
  const squares = jobDetails.roof_squares || 30;
  const complexity = jobDetails.complexity_factor || 1.0;
  const baseHours = squares * baseHoursPerSquare;
  
  return Math.ceil(baseHours * complexity);
}

























