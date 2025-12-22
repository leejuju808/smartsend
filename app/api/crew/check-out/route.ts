// Block 25500 — SmartSend Roofing Payroll & Crew Pay v1
// API Route: Crew Check-Out
// POST /api/crew/check-out

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
    const { 
      job_id, 
      crew_id, 
      check_out_location, 
      end_photos, 
      tasks_completed, 
      cleanup_confirmed, 
      cleanup_photos,
      break_start_time,
      break_end_time,
      drive_time_minutes,
      notes 
    } = body;

    if (!job_id || !crew_id) {
      return NextResponse.json(
        { error: "job_id and crew_id are required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Find active check-in
    const { data: checkIn, error: checkInError } = await supabase
      .from("crew_check_ins")
      .select("*")
      .eq("job_id", job_id)
      .eq("crew_id", crew_id)
      .is("check_out_time", null)
      .single();

    if (checkInError || !checkIn) {
      return NextResponse.json(
        { error: "No active check-in found" },
        { status: 404 }
      );
    }

    // Update check-out
    const updateData: any = {
      check_out_time: new Date().toISOString(),
      check_out_location: check_out_location || null,
      status: "checked_out",
    };

    if (end_photos) updateData.end_photos = end_photos;
    if (tasks_completed) updateData.tasks_completed = tasks_completed;
    if (cleanup_confirmed !== undefined) updateData.cleanup_confirmed = cleanup_confirmed;
    if (cleanup_photos) updateData.cleanup_photos = cleanup_photos;
    if (break_start_time) updateData.break_start_time = break_start_time;
    if (break_end_time) updateData.break_end_time = break_end_time;
    if (drive_time_minutes) updateData.drive_time_minutes = drive_time_minutes;
    if (notes) updateData.notes = notes;

    const { data: updatedCheckIn, error: updateError } = await supabase
      .from("crew_check_ins")
      .update(updateData)
      .eq("id", checkIn.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating check-out:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update check-out" },
        { status: 500 }
      );
    }

    // Trigger pay calculation (will be done by trigger, but we can also call it manually)
    try {
      await supabase.rpc("calculate_crew_pay_entry", {
        p_job_id: job_id,
        p_crew_id: crew_id,
      });
    } catch (rpcError) {
      // RPC may fail if pay entry doesn't exist yet, that's okay
      console.log("Pay calculation RPC called (may not exist yet)");
    }

    return NextResponse.json(
      { check_in: updatedCheckIn },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in crew check-out API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































