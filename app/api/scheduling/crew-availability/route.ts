// Block 242000 — Scheduling Engine v2
// GET /api/scheduling/crew-availability
// Get crew availability for date range

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const crewId = searchParams.get("crew_id");
    const startDate = searchParams.get("start_date") || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get("end_date") || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
      .from("crew_availability")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (crewId) {
      query = query.eq("crew_id", crewId);
    }

    const { data: availability, error: availabilityError } = await query;

    if (availabilityError) {
      console.error("Error fetching availability:", availabilityError);
      return NextResponse.json(
        { error: "Failed to fetch availability" },
        { status: 500 }
      );
    }

    // Also get scheduled jobs to calculate capacity
    let capacityQuery = supabase
      .from("job_schedule")
      .select("crew_id, scheduled_start, scheduled_end, estimated_duration_hours")
      .eq("workspace_id", workspaceId)
      .gte("scheduled_start", startDate)
      .lte("scheduled_end", endDate)
      .in("status", ["scheduled", "in_progress"]);

    if (crewId) {
      capacityQuery = capacityQuery.eq("crew_id", crewId);
    }

    const { data: schedules } = await capacityQuery;

    // Calculate capacity per day
    const capacityByDate: Record<string, any> = {};
    
    (schedules || []).forEach((schedule: any) => {
      const date = new Date(schedule.scheduled_start).toISOString().split('T')[0];
      if (!capacityByDate[date]) {
        capacityByDate[date] = {
          scheduled_hours: 0,
          jobs_count: 0,
        };
      }
      capacityByDate[date].scheduled_hours += schedule.estimated_duration_hours || 8;
      capacityByDate[date].jobs_count += 1;
    });

    // Combine availability with capacity
    const result = (availability || []).map((avail: any) => {
      const dateStr = avail.date;
      const capacity = capacityByDate[dateStr] || { scheduled_hours: 0, jobs_count: 0 };
      
      return {
        ...avail,
        capacity: {
          scheduled_hours: capacity.scheduled_hours,
          available_hours: Math.max(0, 8 - capacity.scheduled_hours), // Assume 8 hour day
          jobs_count: capacity.jobs_count,
          utilization_percent: Math.min(100, (capacity.scheduled_hours / 8) * 100),
        },
      };
    });

    return NextResponse.json({
      availability: result,
      date_range: { start: startDate, end: endDate },
    });
  } catch (error: any) {
    console.error("Error in crew availability:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/scheduling/crew-availability
// Set crew availability
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
    const { crew_id, date, is_available, notes } = body;

    if (!crew_id || !date) {
      return NextResponse.json(
        { error: "crew_id and date are required" },
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

    // Upsert availability
    const { data: availability, error: availabilityError } = await supabase
      .from("crew_availability")
      .upsert({
        workspace_id: workspaceId,
        crew_id,
        date,
        is_available: is_available !== undefined ? is_available : true,
        notes,
      }, {
        onConflict: "crew_id,date",
      })
      .select()
      .single();

    if (availabilityError) {
      console.error("Error setting availability:", availabilityError);
      return NextResponse.json(
        { error: "Failed to set availability" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      availability,
    });
  } catch (error: any) {
    console.error("Error in crew availability POST:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























