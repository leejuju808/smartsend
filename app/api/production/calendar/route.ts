// API Route: Get production calendar data
// GET /api/production/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&crew_id=uuid

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const crew_id = searchParams.get("crew_id");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to date parameters are required" },
        { status: 400 }
      );
    }

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ calendar: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Build query
    let query = supabase
      .from("crew_schedules")
      .select(`
        id,
        job_id,
        crew_id,
        start_date,
        end_date,
        estimated_duration,
        estimated_duration_days,
        ai_predicted_duration,
        status,
        delay_reason,
        delay_days,
        notes,
        jobs:roofing_jobs (
          id,
          title,
          job_value,
          official_squares,
          estimated_squares:roof_squares,
          address
        ),
        crews (
          id,
          name,
          foreman_name,
          daily_capacity_squares
        )
      `)
      .in("workspace_id", workspaceIds)
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date", { ascending: true });

    if (crew_id) {
      query = query.eq("crew_id", crew_id);
    }

    const { data: schedules, error } = await query;

    if (error) throw error;

    // Format response
    const calendar = (schedules || []).map((schedule: any) => ({
      id: schedule.id,
      job_id: schedule.job_id,
      crew_id: schedule.crew_id,
      start_date: schedule.start_date,
      end_date: schedule.end_date,
      estimated_duration: schedule.estimated_duration,
      estimated_duration_days: schedule.estimated_duration_days,
      ai_predicted_duration: schedule.ai_predicted_duration,
      status: schedule.status,
      delay_reason: schedule.delay_reason,
      delay_days: schedule.delay_days,
      notes: schedule.notes,
      job: schedule.jobs ? {
        id: schedule.jobs.id,
        title: schedule.jobs.title || `Job ${schedule.jobs.id.slice(0, 8)}`,
        job_value: schedule.jobs.job_value,
        estimated_squares: schedule.jobs.estimated_squares,
        official_squares: schedule.jobs.official_squares,
        address: schedule.jobs.address,
      } : null,
      crew: schedule.crews ? {
        id: schedule.crews.id,
        name: schedule.crews.name,
        foreman_name: schedule.crews.foreman_name,
        daily_capacity_squares: schedule.crews.daily_capacity_squares,
      } : null,
    }));

    return NextResponse.json({ calendar });
  } catch (error: any) {
    console.error("Error fetching calendar:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































