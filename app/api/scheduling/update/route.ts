// Block 242000 — Scheduling Engine v2
// POST /api/scheduling/update
// Update existing schedule

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
    const { schedule_id, scheduled_start, scheduled_end, crew_id, status, notes } = body;

    if (!schedule_id) {
      return NextResponse.json(
        { error: "schedule_id is required" },
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

    // Get existing schedule
    const { data: existingSchedule, error: fetchError } = await supabase
      .from("job_schedule")
      .select("*")
      .eq("id", schedule_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !existingSchedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    // Check for conflicts if dates/crew changed
    const checkCrewId = crew_id || existingSchedule.crew_id;
    const checkStart = scheduled_start ? new Date(scheduled_start) : new Date(existingSchedule.scheduled_start);
    const checkEnd = scheduled_end ? new Date(scheduled_end) : new Date(existingSchedule.scheduled_end);

    if (scheduled_start || scheduled_end || crew_id) {
      const { data: conflicts } = await supabase
        .from("job_schedule")
        .select("id")
        .eq("crew_id", checkCrewId)
        .eq("workspace_id", workspaceId)
        .in("status", ["scheduled", "in_progress"])
        .neq("id", schedule_id)
        .or(`scheduled_start.lte.${checkEnd.toISOString()},scheduled_end.gte.${checkStart.toISOString()}`);

      if (conflicts && conflicts.length > 0) {
        return NextResponse.json(
          { 
            error: "Scheduling conflict detected",
            conflicts: conflicts.map((c: any) => c.id)
          },
          { status: 409 }
        );
      }
    }

    // Build update object
    const updateData: any = {};
    if (scheduled_start) updateData.scheduled_start = new Date(scheduled_start).toISOString();
    if (scheduled_end) updateData.scheduled_end = new Date(scheduled_end).toISOString();
    if (crew_id) updateData.crew_id = crew_id;
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    // Update schedule
    const { data: updatedSchedule, error: updateError } = await supabase
      .from("job_schedule")
      .update(updateData)
      .eq("id", schedule_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating schedule:", updateError);
      return NextResponse.json(
        { error: "Failed to update schedule" },
        { status: 500 }
      );
    }

    // Update roofing_jobs table if dates changed
    if (scheduled_start || scheduled_end) {
      await supabase
        .from("roofing_jobs")
        .update({
          scheduled_start_date: checkStart.toISOString().split('T')[0],
          scheduled_end_date: checkEnd.toISOString().split('T')[0],
        })
        .eq("id", existingSchedule.job_id);
    }

    return NextResponse.json({
      success: true,
      schedule: updatedSchedule,
    });
  } catch (error: any) {
    console.error("Error in scheduling update:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























