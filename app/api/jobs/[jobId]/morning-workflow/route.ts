// Block 24380 — SmartSend Roofing Crew Assignment & Readiness v1
// API Route: Job Morning Workflow (On The Way, Arrived, Materials Confirmed)
// POST /api/jobs/[jobId]/morning-workflow

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
    const { status, crew_member_id, check_in_location, materials_confirmed, materials_notes, safety_checklist_items, notes } = body;

    if (!status) {
      return NextResponse.json(
        { error: "status is required" },
        { status: 400 }
      );
    }

    // Verify job exists and get crew assignment
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        workspace_id,
        job_crew_assignments!inner(
          crew_id,
          unassigned_at
        )
      `)
      .eq("id", jobId)
      .is("job_crew_assignments.unassigned_at", null)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found or no crew assigned" },
        { status: 404 }
      );
    }

    const crewId = job.job_crew_assignments[0]?.crew_id;

    // Handle different statuses
    if (status === "on_the_way") {
      await supabase.rpc("handle_crew_on_the_way", {
        p_job_id: jobId,
        p_crew_member_id: crew_member_id || null,
      });
    } else if (status === "arrived") {
      await supabase.rpc("handle_crew_arrived", {
        p_job_id: jobId,
        p_crew_member_id: crew_member_id || null,
        p_location: check_in_location || null,
      });
    }

    // Create workflow entry
    const workflowData: any = {
      job_id: jobId,
      workspace_id: job.workspace_id,
      crew_id: crewId,
      crew_member_id: crew_member_id || null,
      status,
      check_in_location: check_in_location || null,
      check_in_time: status === "arrived" ? new Date().toISOString() : null,
      materials_confirmed: materials_confirmed || null,
      materials_notes: materials_notes || null,
      safety_checklist_completed: safety_checklist_items ? safety_checklist_items.length > 0 : false,
      safety_checklist_items: safety_checklist_items || [],
      notes: notes || null,
    };

    const { data: workflow, error: workflowError } = await supabase
      .from("job_morning_workflow")
      .insert(workflowData)
      .select()
      .single();

    if (workflowError) {
      console.error("Error creating workflow entry:", workflowError);
      return NextResponse.json(
        { error: workflowError.message || "Failed to create workflow entry" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { workflow },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in morning workflow:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Get morning workflow status for a job
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

    // Get latest workflow entries for this job
    const { data: workflow, error: workflowError } = await supabase
      .from("job_morning_workflow")
      .select(`
        *,
        crew:crews(
          id,
          name,
          color
        ),
        crew_member:crew_members(
          id,
          name
        )
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (workflowError) {
      console.error("Error fetching workflow:", workflowError);
      return NextResponse.json(
        { error: workflowError.message || "Failed to fetch workflow" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { workflow: workflow || [] },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching morning workflow:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































