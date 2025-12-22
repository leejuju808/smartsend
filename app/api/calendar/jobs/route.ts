// Block 22280 — SmartSend Roofing Job Calendar & Crew View v1
// API Route: Get Jobs for Calendar
// GET /api/calendar/jobs?from=YYYY-MM-DD&to=YYYY-MM-DD

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

    // Parse query parameters
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing from/to parameters" },
        { status: 400 }
      );
    }

    // Fetch jobs in range (any overlap)
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select(
        `
        id,
        title,
        status,
        job_value,
        scheduled_start_date,
        scheduled_end_date,
        lead_id,
        job_crew_assignments(
          unassigned_at,
          crew:crews(id, name, color)
        )
      `
      )
      .in("workspace_id", workspaceIds)
      .or(
        `scheduled_start_date.gte.${from}.and.scheduled_start_date.lte.${to},scheduled_end_date.gte.${from}.and.scheduled_end_date.lte.${to},scheduled_start_date.lte.${from}.and.scheduled_end_date.gte.${to}`
      )
      .order("scheduled_start_date", { ascending: true });

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      return NextResponse.json(
        { error: jobsError.message || "Failed to fetch jobs" },
        { status: 500 }
      );
    }

    // Also fetch leads for homeowner info
    const leadIds = (jobs || [])
      .map((j: any) => j.lead_id)
      .filter((id: any) => id !== null);

    let leadsMap: Record<string, any> = {};
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, first_name, last_name, city")
        .in("id", leadIds);

      if (leads) {
        leads.forEach((lead) => {
          leadsMap[lead.id] = lead;
        });
      }
    }

    // Also fetch crews for the "crew view"
    const { data: crews, error: crewError } = await supabase
      .from("crews")
      .select("id, name, color, is_active")
      .in("workspace_id", workspaceIds)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (crewError) {
      console.error("Error fetching crews:", crewError);
      // Don't fail the request, just log it
    }

    // Enrich jobs with lead info and filter active crew assignments
    const enrichedJobs = (jobs || []).map((job: any) => {
      const lead = job.lead_id ? leadsMap[job.lead_id] : null;
      // Filter to only active crew assignments (unassigned_at is null)
      const activeAssignments = (job.job_crew_assignments || []).filter(
        (assignment: any) => !assignment.unassigned_at
      );
      return {
        ...job,
        lead: lead || null,
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
    console.error("Error in calendar jobs API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

