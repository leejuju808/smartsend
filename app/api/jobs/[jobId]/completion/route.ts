// Block 24380 — SmartSend Roofing Crew Assignment & Readiness v1
// API Route: Crew Completion Workflow
// POST /api/jobs/[jobId]/completion

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
    const {
      crew_member_id,
      cleanup_completed,
      photos_uploaded,
      before_photos,
      after_photos,
      warranty_delivered,
      warranty_notes,
      completion_notes,
    } = body;

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

    // Call completion handler function
    await supabase.rpc("handle_job_completion", {
      p_job_id: jobId,
      p_crew_member_id: crew_member_id || null,
      p_completion_notes: completion_notes || null,
    });

    // Create or update completion workflow entry
    const { data: existingCompletion } = await supabase
      .from("crew_completion_workflow")
      .select("id")
      .eq("job_id", jobId)
      .single();

    const completionData: any = {
      job_id: jobId,
      workspace_id: job.workspace_id,
      crew_id: crewId,
      completed_by: crew_member_id || null,
      status: "marked_complete",
      cleanup_completed: cleanup_completed || false,
      photos_uploaded: photos_uploaded || false,
      before_photos: before_photos || [],
      after_photos: after_photos || [],
      warranty_delivered: warranty_delivered || false,
      warranty_notes: warranty_notes || null,
      completion_notes: completion_notes || null,
    };

    let completion;
    if (existingCompletion) {
      const { data: updated, error: updateError } = await supabase
        .from("crew_completion_workflow")
        .update(completionData)
        .eq("id", existingCompletion.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating completion:", updateError);
        return NextResponse.json(
          { error: updateError.message || "Failed to update completion" },
          { status: 500 }
        );
      }
      completion = updated;
    } else {
      const { data: created, error: createError } = await supabase
        .from("crew_completion_workflow")
        .insert(completionData)
        .select()
        .single();

      if (createError) {
        console.error("Error creating completion:", createError);
        return NextResponse.json(
          { error: createError.message || "Failed to create completion" },
          { status: 500 }
        );
      }
      completion = created;
    }

    return NextResponse.json(
      { completion },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in completion workflow:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Get completion workflow status
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

    // Get completion workflow
    const { data: completion, error: completionError } = await supabase
      .from("crew_completion_workflow")
      .select(`
        *,
        crew:crews(
          id,
          name
        ),
        completed_by_member:crew_members!crew_completion_workflow_completed_by_fkey(
          id,
          name
        )
      `)
      .eq("job_id", jobId)
      .single();

    if (completionError && completionError.code !== "PGRST116") {
      console.error("Error fetching completion:", completionError);
      return NextResponse.json(
        { error: completionError.message || "Failed to fetch completion" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { completion: completion || null },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching completion workflow:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































