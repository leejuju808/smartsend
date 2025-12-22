// Block 22380 — SmartSend Roofing Job Scheduling Board v1
// API Route: Get Scheduling Board Data
// GET /api/scheduling/board

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
      return NextResponse.json({ jobs: [], crews: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // 1. Fetch all jobs that are NOT completed/cancelled
    const { data: jobs, error: jobErr } = await supabase
      .from("roofing_jobs")
      .select(`
        *,
        lead:leads(first_name, last_name, city),
        job_crew_assignments(
          unassigned_at,
          crew:crews(id, name, color)
        )
      `)
      .in("workspace_id", workspaceIds)
      .in("status", ["unscheduled", "scheduled", "in_progress"])
      // Note: "awaiting_scheduling" maps to "unscheduled" in the database
      .order("scheduled_start_date", { ascending: true, nullsFirst: true });

    if (jobErr) {
      console.error("Error fetching jobs:", jobErr);
      return NextResponse.json(
        { error: jobErr.message || "Failed to fetch jobs" },
        { status: 500 }
      );
    }

    // 2. Fetch crews
    const { data: crews, error: crewErr } = await supabase
      .from("crews")
      .select("*")
      .in("workspace_id", workspaceIds)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (crewErr) {
      console.error("Error fetching crews:", crewErr);
      return NextResponse.json(
        { error: crewErr.message || "Failed to fetch crews" },
        { status: 500 }
      );
    }

    // Filter active crew assignments and enrich jobs
    const enrichedJobs = (jobs || []).map((job: any) => {
      // Filter to only active crew assignments (unassigned_at is null)
      const activeAssignments = (job.job_crew_assignments || []).filter(
        (assignment: any) => !assignment.unassigned_at
      );
      return {
        ...job,
        job_crew_assignments: activeAssignments,
      };
    });

    return NextResponse.json(
      {
        jobs: enrichedJobs || [],
        crews: crews || [],
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in scheduling board API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

