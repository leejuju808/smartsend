// Block 47000 — Check Crew Conflicts
// GET: Check for crew double-booking conflicts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const dateFrom = searchParams.get("date_from") || new Date().toISOString().split('T')[0];
    const dateTo = searchParams.get("date_to") || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Call the database function to detect conflicts
    const { data: conflicts, error } = await supabase.rpc(
      "detect_crew_day_conflicts",
      {
        p_workspace_id: workspaceId || null,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      }
    );

    if (error) {
      console.error("Detect conflicts error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to detect conflicts" },
        { status: 400 }
      );
    }

    // Enrich conflicts with job and crew details
    const conflictIds = (conflicts || []).map((c: any) => c.job_day_id);
    const conflictingIds = (conflicts || []).map((c: any) => c.conflicting_job_day_id).filter(Boolean);
    const allDayIds = [...new Set([...conflictIds, ...conflictingIds])];

    let enrichedConflicts = conflicts || [];

    if (allDayIds.length > 0) {
      const { data: daySchedules } = await supabase
        .from("job_day_schedules")
        .select(`
          id,
          job_id,
          day_number,
          start_date,
          crews (
            id,
            name,
            color
          )
        `)
        .in("id", allDayIds);

      if (daySchedules) {
        // Get job details
        const jobIds = [...new Set(daySchedules.map((d: any) => d.job_id))];
        const { data: jobs } = await supabase
          .from("roofing_jobs")
          .select("id, title, job_value")
          .in("id", jobIds);

        const jobsMap = new Map((jobs || []).map((j: any) => [j.id, j]));

        enrichedConflicts = (conflicts || []).map((conflict: any) => {
          const daySchedule = daySchedules.find((d: any) => d.id === conflict.job_day_id);
          const conflictingSchedule = daySchedules.find((d: any) => d.id === conflict.conflicting_job_day_id);
          
          return {
            ...conflict,
            job_day: daySchedule ? {
              ...daySchedule,
              job: jobsMap.get(daySchedule.job_id),
            } : null,
            conflicting_job_day: conflictingSchedule ? {
              ...conflictingSchedule,
              job: jobsMap.get(conflictingSchedule.job_id),
            } : null,
          };
        });
      }
    }

    return NextResponse.json({
      conflicts: enrichedConflicts,
      total_conflicts: enrichedConflicts.length,
      critical_conflicts: enrichedConflicts.filter((c: any) => c.severity === 'critical').length,
      date_range: {
        from: dateFrom,
        to: dateTo,
      },
    });
  } catch (error: any) {
    console.error("Check crew conflicts error:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
































