// Block 22280 — SmartSend Roofing Job Calendar & Crew View v1
// API Route: Assign Job to Crew
// POST /api/calendar/assign-crew

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { job_id, crew_id, skip_capacity_check } = body;

    if (!job_id || !crew_id) {
      return NextResponse.json(
        { error: "Missing job_id or crew_id" },
        { status: 400 }
      );
    }

    // Verify job belongs to user's workspace
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id, scheduled_start_date, scheduled_end_date, scheduled_duration_days, labor_effort")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Verify crew belongs to same workspace
    const { data: crew, error: crewError } = await supabase
      .from("crews")
      .select("id, name, workspace_id")
      .eq("id", crew_id)
      .eq("workspace_id", job.workspace_id)
      .single();

    if (crewError || !crew) {
      return NextResponse.json(
        { error: "Crew not found" },
        { status: 404 }
      );
    }

    // Block 22390: Check capacity if job is scheduled and not skipping check
    if (job.scheduled_start_date && !skip_capacity_check) {
      const { data: capacityCheck, error: checkError } = await supabase
        .rpc("check_crew_capacity", {
          p_crew_id: crew_id,
          p_job_id: job_id,
          p_start_date: job.scheduled_start_date,
          p_end_date: job.scheduled_end_date || null,
        });

      if (checkError) {
        console.error("Error checking capacity:", checkError);
        return NextResponse.json(
          { error: checkError.message || "Failed to check capacity" },
          { status: 500 }
        );
      }

      // If capacity check failed, return conflicts
      if (!capacityCheck?.ok) {
        return NextResponse.json(
          {
            error: "Capacity exceeded",
            conflicts: capacityCheck?.conflicts || [],
            capacity: capacityCheck?.capacity,
            jobEffort: capacityCheck?.jobEffort,
          },
          { status: 409 } // Conflict status
        );
      }
    }

    // 1. Close existing assignment(s)
    const { error: closeError } = await supabase
      .from("job_crew_assignments")
      .update({
        unassigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", job_id)
      .is("unassigned_at", null);

    if (closeError) {
      console.error("Error closing existing assignments:", closeError);
      // Continue anyway
    }

    // 2. Create new assignment
    const { error: insertError } = await supabase
      .from("job_crew_assignments")
      .insert({
        job_id,
        crew_id,
      });

    if (insertError) {
      console.error("Error creating assignment:", insertError);
      return NextResponse.json(
        { error: insertError.message || "Failed to assign crew" },
        { status: 500 }
      );
    }

    // Optionally mirror crew_name on jobs for easy display
    const { error: updateError } = await supabase
      .from("roofing_jobs")
      .update({
        crew_name: crew.name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    if (updateError) {
      console.error("Error updating job crew_name:", updateError);
      // Don't fail the request, assignment was successful
    }

    return NextResponse.json(
      { success: true },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in assign crew API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

