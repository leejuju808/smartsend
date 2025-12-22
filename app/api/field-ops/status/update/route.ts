// Block 255400 — Field Operations Command v1
// API Route: Update Jobsite Status
// POST /api/field-ops/status/update

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
    const {
      job_id,
      status,
      notes,
      photos,
      gps_lat,
      gps_lng,
      crew_member_id,
    } = body;

    if (!job_id || !status) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, status" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = [
      "arriving",
      "arrived",
      "setup",
      "tearoff",
      "install_underlayment",
      "shingles",
      "ridge",
      "cleanup",
      "completed",
      "paused",
      "issue",
    ];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      // Try jobs table as fallback
      const { data: jobAlt, error: jobAltError } = await supabase
        .from("jobs")
        .select("id, team_id")
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

    // Get crew_member_id if not provided but user is a crew member
    let finalCrewMemberId = crew_member_id;
    if (!finalCrewMemberId) {
      const { data: crewMember } = await supabase
        .from("crew_members")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (crewMember) {
        finalCrewMemberId = crewMember.id;
      }
    }

    // Check workflow enforcement if moving to a restricted stage
    if (["shingles", "ridge", "completed"].includes(status)) {
      const { data: jobData } = await supabase
        .from("roofing_jobs")
        .select("job_type")
        .eq("id", job_id)
        .single();

      const { data: workflowCheck } = await supabase.rpc("can_proceed_to_stage", {
        p_job_id: job_id,
        p_target_stage: status,
        p_job_type: jobData?.job_type || null,
      });

      if (workflowCheck && !workflowCheck.can_proceed) {
        return NextResponse.json(
          {
            error: "Cannot proceed to this stage",
            message: workflowCheck.message,
            missing_photos: workflowCheck.missing_photos || [],
            missing_statuses: workflowCheck.missing_statuses || [],
          },
          { status: 400 }
        );
      }
    }

    // Insert status update
    const { data: statusUpdate, error: insertError } = await supabase
      .from("jobsite_status_updates")
      .insert({
        job_id,
        status,
        notes: notes || null,
        photos: photos ? (Array.isArray(photos) ? photos : [photos]) : [],
        gps_lat: gps_lat ? parseFloat(gps_lat) : null,
        gps_lng: gps_lng ? parseFloat(gps_lng) : null,
        created_by: finalCrewMemberId || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting status update:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    // If status is completed, create workflow checkpoints if needed
    if (status === "completed") {
      // Mark all workflow checkpoints as completed
      await supabase
        .from("job_workflow_checkpoints")
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq("job_id", job_id)
        .eq("is_completed", false);
    }

    return NextResponse.json({ status_update: statusUpdate }, { status: 201 });
  } catch (error: any) {
    console.error("Error in status update endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// GET: Get jobsite timeline for a job
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

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Verify job access
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
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
        .eq("id", jobId)
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

    // Get timeline using helper function
    const { data: timeline, error: timelineError } = await supabase.rpc(
      "get_jobsite_timeline",
      { p_job_id: jobId }
    );

    if (timelineError) {
      console.error("Error fetching timeline:", timelineError);
      return NextResponse.json(
        { error: timelineError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ timeline: timeline || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in timeline get endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}





















