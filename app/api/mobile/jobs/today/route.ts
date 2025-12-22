// Block 238000 — SmartSend Mobile App v1
// GET /api/mobile/jobs/today
// Returns today's jobs for the authenticated user (crew, sales, manager)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate user
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

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get user's workspaces/teams
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Check if user is assigned to any crews
    const { data: crewMembers } = await supabase
      .from("crew_members")
      .select("crew_id")
      .eq("user_id", user.id)
      .eq("is_active", true);

    // Get jobs assigned to user's crews OR jobs in user's workspaces scheduled for today
    let jobsQuery = supabase
      .from("jobs")
      .select(`
        id,
        lead_id,
        team_id,
        stage,
        contract_value,
        insurance,
        notes,
        created_at,
        updated_at,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          address
        ),
        crew_assignments (
          id,
          crew_id,
          assigned_at,
          crews:crew_id (
            id,
            name
          )
        ),
        job_materials (
          id,
          material_type,
          supplier,
          ordered_at,
          delivered
        ),
        job_photos (
          id,
          photo_url,
          label,
          created_at
        ),
        job_schedule (
          id,
          start_date,
          duration_days
        )
      `)
      .in("team_id", workspaceIds);

    // If user is a crew member, filter by crew assignments
    if (crewMembers && crewMembers.length > 0) {
      const crewIds = crewMembers.map((cm) => cm.crew_id);
      const { data: assignedJobs } = await supabase
        .from("crew_assignments")
        .select("job_id")
        .in("crew_id", crewIds);

      if (assignedJobs && assignedJobs.length > 0) {
        const jobIds = assignedJobs.map((aj) => aj.job_id);
        jobsQuery = jobsQuery.in("id", jobIds);
      }
    }

    // Filter for jobs scheduled today or in progress
    const { data: jobs, error: jobsError } = await jobsQuery
      .or("stage.eq.in_progress,stage.eq.scheduled")
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("Error fetching today's jobs:", jobsError);
      return NextResponse.json(
        { error: jobsError.message || "Failed to fetch jobs" },
        { status: 500 }
      );
    }

    // Format response
    const formattedJobs = (jobs || []).map((job: any) => ({
      id: job.id,
      lead: job.leads ? {
        id: job.leads.id,
        name: `${job.leads.first_name || ""} ${job.leads.last_name || ""}`.trim(),
        email: job.leads.email,
        phone: job.leads.phone,
        address: job.leads.address,
      } : null,
      stage: job.stage,
      contractValue: job.contract_value,
      insurance: job.insurance,
      notes: job.notes,
      crew: job.crew_assignments?.[0]?.crews || null,
      materials: job.job_materials || [],
      photos: job.job_photos || [],
      schedule: job.job_schedule?.[0] || null,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    }));

    return NextResponse.json({
      success: true,
      jobs: formattedJobs,
      count: formattedJobs.length,
    });
  } catch (error: any) {
    console.error("Error in today's jobs API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























