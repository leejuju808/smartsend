// Block 255400 — Field Operations Command v1
// API Route: Check Workflow Enforcement
// POST /api/field-ops/workflow/check

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
    const { job_id, target_stage, job_type } = body;

    if (!job_id || !target_stage) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, target_stage" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, job_type")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      // Try jobs table
      const { data: jobAlt, error: jobAltError } = await supabase
        .from("jobs")
        .select("id, team_id, job_type")
        .eq("id", job_id)
        .single();

      if (jobAltError || !jobAlt) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      // Verify team access
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("team_id", jobAlt.team_id)
        .eq("user_id", user.id)
        .single();

      if (!teamMember) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    } else {
      // Verify workspace access
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
    }

    // Check workflow using helper function
    const { data: workflowCheck, error: checkError } = await supabase.rpc(
      "can_proceed_to_stage",
      {
        p_job_id: job_id,
        p_target_stage: target_stage,
        p_job_type: job_type || job?.job_type || null,
      }
    );

    if (checkError) {
      console.error("Error checking workflow:", checkError);
      return NextResponse.json(
        { error: checkError.message },
        { status: 400 }
      );
    }

    return NextResponse.json(workflowCheck, { status: 200 });
  } catch (error: any) {
    console.error("Error in workflow check endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// POST: Mark workflow checkpoint as completed
export async function PUT(req: NextRequest) {
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
    const { job_id, checkpoint_name, photo_urls } = body;

    if (!job_id || !checkpoint_name) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, checkpoint_name" },
        { status: 400 }
      );
    }

    // Verify job access
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (job) {
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
    } else {
      // Try jobs table
      const { data: jobAlt } = await supabase
        .from("jobs")
        .select("id, team_id")
        .eq("id", job_id)
        .single();

      if (jobAlt) {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("team_id", jobAlt.team_id)
          .eq("user_id", user.id)
          .single();

        if (!teamMember) {
          return NextResponse.json(
            { error: "Access denied" },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
    }

    // Get crew member
    const { data: crewMember } = await supabase
      .from("crew_members")
      .select("id")
      .eq("user_id", user.id)
      .single();

    // Upsert checkpoint
    const { data: checkpoint, error: upsertError } = await supabase
      .from("job_workflow_checkpoints")
      .upsert(
        {
          job_id,
          checkpoint_name,
          checkpoint_type: "photo",
          is_completed: true,
          completed_at: new Date().toISOString(),
          completed_by: crewMember?.id || null,
          photo_urls: photo_urls ? (Array.isArray(photo_urls) ? photo_urls : [photo_urls]) : [],
        },
        {
          onConflict: "job_id,checkpoint_name",
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error("Error upserting checkpoint:", upsertError);
      return NextResponse.json(
        { error: upsertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ checkpoint }, { status: 200 });
  } catch (error: any) {
    console.error("Error in workflow checkpoint endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}





















