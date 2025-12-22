// Block 24380 — SmartSend Roofing Crew Assignment & Readiness v1
// API Route: Assign Crew to Job
// POST /api/jobs/[jobId]/crew-assignment

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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
    const { crew_id, crew_leader_id, helper_ids, project_supervisor_id, assignment_notes } = body;

    if (!crew_id) {
      return NextResponse.json(
        { error: "crew_id is required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
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

    // Unassign any existing crew assignments for this job
    await supabase
      .from("job_crew_assignments")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .is("unassigned_at", null);

    // Create new crew assignment
    const { data: assignment, error: assignError } = await supabase
      .from("job_crew_assignments")
      .insert({
        job_id: jobId,
        crew_id,
        crew_leader_id: crew_leader_id || null,
        helper_ids: helper_ids || [],
        project_supervisor_id: project_supervisor_id || null,
        assignment_notes: assignment_notes || null,
        assigned_by: user.id,
      })
      .select()
      .single();

    if (assignError) {
      console.error("Error assigning crew:", assignError);
      return NextResponse.json(
        { error: assignError.message || "Failed to assign crew" },
        { status: 500 }
      );
    }

    // Auto-create readiness checklist (trigger will handle this, but we can also trigger manually)
    await supabase.rpc("auto_create_readiness_checklist");

    return NextResponse.json(
      { assignment },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in crew assignment:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Get crew assignment for a job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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

    // Get crew assignment with related data
    const { data: assignment, error: assignError } = await supabase
      .from("job_crew_assignments")
      .select(`
        *,
        crew:crews(
          id,
          name,
          color,
          crew_leader:crew_members!crews_crew_leader_id_fkey(
            id,
            name,
            phone_number,
            email
          ),
          crew_members:crew_members(
            id,
            name,
            role,
            phone_number,
            email,
            is_crew_leader
          )
        ),
        crew_leader:crew_members!job_crew_assignments_crew_leader_id_fkey(
          id,
          name,
          phone_number,
          email
        ),
        project_supervisor:crew_members!job_crew_assignments_project_supervisor_id_fkey(
          id,
          name,
          phone_number,
          email
        ),
        helpers:crew_members(
          id,
          name,
          phone_number,
          email
        )
      `)
      .eq("job_id", jobId)
      .is("unassigned_at", null)
      .single();

    if (assignError && assignError.code !== "PGRST116") {
      console.error("Error fetching crew assignment:", assignError);
      return NextResponse.json(
        { error: assignError.message || "Failed to fetch crew assignment" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { assignment: assignment || null },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching crew assignment:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































