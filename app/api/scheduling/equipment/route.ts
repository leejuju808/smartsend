// Block 242000 — Scheduling Engine v2
// POST /api/scheduling/equipment
// Schedule equipment to jobs

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
    const { equipment_id, job_id, crew_id, scheduled_date, scheduled_start_time, scheduled_end_time, notes } = body;

    if (!equipment_id || !job_id || !scheduled_date) {
      return NextResponse.json(
        { error: "equipment_id, job_id, and scheduled_date are required" },
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

    // Verify equipment exists
    const { data: equipment, error: equipmentError } = await supabase
      .from("equipment")
      .select("id, workspace_id, status")
      .eq("id", equipment_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (equipmentError || !equipment) {
      return NextResponse.json(
        { error: "Equipment not found" },
        { status: 404 }
      );
    }

    if (equipment.status !== "available") {
      return NextResponse.json(
        { error: `Equipment is not available (status: ${equipment.status})` },
        { status: 409 }
      );
    }

    // Check for conflicts
    const { data: conflicts } = await supabase
      .from("equipment_schedule")
      .select("id")
      .eq("equipment_id", equipment_id)
      .eq("scheduled_date", scheduled_date)
      .eq("status", "scheduled")
      .or(
        scheduled_start_time && scheduled_end_time
          ? `scheduled_start_time.lte.${scheduled_end_time},scheduled_end_time.gte.${scheduled_start_time}`
          : undefined
      );

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { 
          error: "Equipment already scheduled for this date/time",
          conflicts: conflicts.map((c: any) => c.id)
        },
        { status: 409 }
      );
    }

    // Create equipment schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("equipment_schedule")
      .insert({
        workspace_id: workspaceId,
        equipment_id,
        job_id,
        crew_id,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        status: "scheduled",
        notes,
      })
      .select()
      .single();

    if (scheduleError) {
      console.error("Error creating equipment schedule:", scheduleError);
      return NextResponse.json(
        { error: "Failed to schedule equipment" },
        { status: 500 }
      );
    }

    // Update equipment status
    await supabase
      .from("equipment")
      .update({ status: "checked_out" })
      .eq("id", equipment_id);

    return NextResponse.json({
      success: true,
      schedule,
    });
  } catch (error: any) {
    console.error("Error in equipment scheduling:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/scheduling/equipment
// Get equipment schedules
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const equipmentId = searchParams.get("equipment_id");
    const jobId = searchParams.get("job_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

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

    // Build query
    let query = supabase
      .from("equipment_schedule")
      .select(`
        *,
        equipment:equipment(id, name, type),
        job:roofing_jobs(id, title, address),
        crew:crews(id, name)
      `)
      .eq("workspace_id", workspaceId)
      .order("scheduled_date", { ascending: true });

    if (equipmentId) {
      query = query.eq("equipment_id", equipmentId);
    }
    if (jobId) {
      query = query.eq("job_id", jobId);
    }
    if (startDate) {
      query = query.gte("scheduled_date", startDate);
    }
    if (endDate) {
      query = query.lte("scheduled_date", endDate);
    }

    const { data: schedules, error: schedulesError } = await query;

    if (schedulesError) {
      console.error("Error fetching equipment schedules:", schedulesError);
      return NextResponse.json(
        { error: "Failed to fetch schedules" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      schedules: schedules || [],
    });
  } catch (error: any) {
    console.error("Error in equipment scheduling GET:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























