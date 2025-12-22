// Block 22750 — SmartSend Roofing Field App v1
// API Route: Check In to a Job
// POST /api/field/check-in

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

    const { job_id, crew_id, workspace_id } = await req.json();

    if (!job_id || !workspace_id) {
      return NextResponse.json(
        { error: "job_id and workspace_id required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Check if there's already an active session for this job
    const { data: existingSession } = await supabase
      .from("job_field_sessions")
      .select("id")
      .eq("job_id", job_id)
      .eq("workspace_id", workspace_id)
      .is("check_out_at", null)
      .single();

    if (existingSession) {
      return NextResponse.json(
        { error: "Already checked in to this job", session_id: existingSession.id },
        { status: 400 }
      );
    }

    // Get crew_id from job_crew_assignments if not provided
    let finalCrewId = crew_id;
    if (!finalCrewId) {
      const { data: assignment } = await supabase
        .from("job_crew_assignments")
        .select("crew_id")
        .eq("job_id", job_id)
        .is("unassigned_at", null)
        .single();

      if (assignment) {
        finalCrewId = assignment.crew_id;
      }
    }

    // Create field session
    const { data: session, error: sessionError } = await supabase
      .from("job_field_sessions")
      .insert({
        workspace_id,
        job_id,
        crew_id: finalCrewId,
        user_id: user.id,
        check_in_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionError) {
      console.error("Error creating field session:", sessionError);
      return NextResponse.json(
        { error: sessionError.message || "Failed to check in" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { session, message: "Checked in successfully" },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in field check-in API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































