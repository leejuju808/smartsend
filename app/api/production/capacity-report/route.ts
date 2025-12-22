// API Route: Get crew workload/capacity report
// GET /api/production/capacity-report?week_start=YYYY-MM-DD

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
    const weekStart = searchParams.get("week_start") || new Date().toISOString().split("T")[0];

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ reports: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Calculate week end (7 days later)
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = weekEndDate.toISOString().split("T")[0];

    // Get all crews for these workspaces
    const { data: crews } = await supabase
      .from("crews")
      .select("id, name, workspace_id, daily_capacity_squares")
      .in("workspace_id", workspaceIds)
      .eq("is_active", true);

    if (!crews || crews.length === 0) {
      return NextResponse.json({ reports: [] });
    }

    // Get schedules for the week
    const { data: schedules } = await supabase
      .from("crew_schedules")
      .select(`
        id,
        crew_id,
        job_id,
        start_date,
        end_date,
        estimated_duration,
        status,
        jobs:roofing_jobs (
          official_squares,
          job_value
        )
      `)
      .in("workspace_id", workspaceIds)
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart)
      .in("status", ["scheduled", "in_progress"]);

    // Calculate workload per crew
    const reports = crews.map((crew) => {
      const crewSchedules = (schedules || []).filter((s: any) => s.crew_id === crew.id);
      
      // Count jobs and calculate squares
      const jobs_scheduled = crewSchedules.length;
      const total_squares_scheduled = crewSchedules.reduce((sum: number, s: any) => {
        return sum + (s.jobs?.official_squares || 0);
      }, 0);

      // Calculate hours booked
      const total_hours = crewSchedules.reduce((sum: number, s: any) => {
        return sum + (s.estimated_duration || 8);
      }, 0);

      // Calculate weekly capacity
      const daily_capacity = crew.daily_capacity_squares || 20;
      const weekly_capacity_squares = daily_capacity * 5; // 5 work days
      const weekly_capacity_jobs = Math.ceil(weekly_capacity_squares / daily_capacity);

      // Calculate load percentage
      const load_percentage = weekly_capacity_squares > 0
        ? (total_squares_scheduled / weekly_capacity_squares) * 100
        : 0;

      // Calculate projected revenue
      const projected_revenue = crewSchedules.reduce((sum: number, s: any) => {
        return sum + (s.jobs?.job_value || 0);
      }, 0);

      // Count by status
      const scheduled_count = crewSchedules.filter((s: any) => s.status === "scheduled").length;
      const in_progress_count = crewSchedules.filter((s: any) => s.status === "in_progress").length;
      const delayed_count = crewSchedules.filter((s: any) => s.status === "delayed").length;

      // Check if overloaded
      const is_overloaded = load_percentage > 100;

      // Calculate idle days (simplified: days with no work)
      const workDays = new Set<string>();
      crewSchedules.forEach((s: any) => {
        const start = new Date(s.start_date);
        const end = new Date(s.end_date);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dayStr = d.toISOString().split("T")[0];
          if (dayStr >= weekStart && dayStr <= weekEnd) {
            workDays.add(dayStr);
          }
        }
      });
      const idle_days = 5 - workDays.size; // 5 work days per week

      return {
        workspace_id: crew.workspace_id,
        week_start: weekStart,
        crew_id: crew.id,
        crew_name: crew.name,
        jobs_scheduled,
        total_squares_scheduled,
        weekly_capacity_squares,
        weekly_capacity_jobs,
        load_percentage: Math.round(load_percentage * 10) / 10,
        projected_revenue,
        scheduled_count,
        in_progress_count,
        delayed_count,
        is_overloaded,
        idle_days: Math.max(0, idle_days),
        total_hours: Math.round(total_hours * 10) / 10,
      };
    });

    return NextResponse.json({ reports });
  } catch (error: any) {
    console.error("Error fetching capacity report:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































