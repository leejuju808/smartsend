// Block 22750 — SmartSend Roofing Field App v1
// API Route: Get Today's Jobs for Field Crew
// GET /api/field/today?crew_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
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

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Parse query parameters
    const url = new URL(req.url);
    const crewId = url.searchParams.get("crew_id");
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Build query for jobs scheduled today
    let query = supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        status,
        job_value,
        scheduled_start_date,
        scheduled_end_date,
        progress_percent,
        lead_id,
        job_crew_assignments!inner(
          unassigned_at,
          crew:crews(id, name, color)
        )
      `)
      .in("workspace_id", workspaceIds)
      .in("status", ["scheduled", "in_progress"])
      .or(`scheduled_start_date.eq.${today},scheduled_start_date.lte.${today}.and.scheduled_end_date.gte.${today}`)
      .is("job_crew_assignments.unassigned_at", null);

    // Filter by crew if provided
    if (crewId) {
      query = query.eq("job_crew_assignments.crew_id", crewId);
    }

    const { data: jobs, error: jobsError } = await query.order("scheduled_start_date", { ascending: true });

    if (jobsError) {
      console.error("Error fetching today's jobs:", jobsError);
      return NextResponse.json(
        { error: jobsError.message || "Failed to fetch jobs" },
        { status: 500 }
      );
    }

    // Get active field sessions for these jobs
    const jobIds = (jobs || []).map((j: any) => j.id);
    let sessionsMap: Record<string, any> = {};

    if (jobIds.length > 0) {
      const { data: sessions } = await supabase
        .from("job_field_sessions")
        .select("*")
        .in("job_id", jobIds)
        .is("check_out_at", null)
        .order("check_in_at", { ascending: false });

      if (sessions) {
        sessions.forEach((session) => {
          if (!sessionsMap[session.job_id]) {
            sessionsMap[session.job_id] = session;
          }
        });
      }
    }

    // Enrich jobs with active session info
    const enrichedJobs = (jobs || []).map((job: any) => {
      const activeSession = sessionsMap[job.id] || null;
      // Get the first active crew assignment
      const crewAssignment = (job.job_crew_assignments || [])[0] || null;
      
      return {
        ...job,
        active_session: activeSession,
        crew: crewAssignment?.crew || null,
        job_crew_assignments: undefined, // Remove from response
      };
    });

    return NextResponse.json(
      { jobs: enrichedJobs || [] },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in field today API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































