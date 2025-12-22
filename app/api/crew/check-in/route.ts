// Block 25500 — SmartSend Roofing Payroll & Crew Pay v1
// API Route: Crew Check-In
// POST /api/crew/check-in

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
    const { job_id, crew_id, crew_member_id, check_in_location, start_photos, notes } = body;

    if (!job_id || !crew_id) {
      return NextResponse.json(
        { error: "job_id and crew_id are required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", job_id)
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

    // Check if there's already an active check-in
    const { data: existingCheckIn } = await supabase
      .from("crew_check_ins")
      .select("id")
      .eq("job_id", job_id)
      .eq("crew_id", crew_id)
      .is("check_out_time", null)
      .single();

    if (existingCheckIn) {
      return NextResponse.json(
        { error: "Crew already checked in for this job" },
        { status: 400 }
      );
    }

    // Create check-in
    const { data: checkIn, error: checkInError } = await supabase
      .from("crew_check_ins")
      .insert({
        job_id,
        crew_id,
        workspace_id: job.workspace_id,
        crew_member_id: crew_member_id || null,
        check_in_time: new Date().toISOString(),
        check_in_location: check_in_location || null,
        start_photos: start_photos || [],
        notes: notes || null,
        status: "checked_in",
      })
      .select()
      .single();

    if (checkInError) {
      console.error("Error creating check-in:", checkInError);
      return NextResponse.json(
        { error: checkInError.message || "Failed to create check-in" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { check_in: checkIn },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in crew check-in API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Get check-in status for a job/crew
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

    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");
    const crewId = url.searchParams.get("crew_id");

    if (!jobId || !crewId) {
      return NextResponse.json(
        { error: "job_id and crew_id are required" },
        { status: 400 }
      );
    }

    // Get check-in status
    const { data: checkIn, error: checkInError } = await supabase
      .from("crew_check_ins")
      .select("*")
      .eq("job_id", jobId)
      .eq("crew_id", crewId)
      .order("check_in_time", { ascending: false })
      .limit(1)
      .single();

    if (checkInError && checkInError.code !== "PGRST116") {
      console.error("Error fetching check-in:", checkInError);
      return NextResponse.json(
        { error: checkInError.message || "Failed to fetch check-in" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { check_in: checkIn || null },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in crew check-in GET API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































