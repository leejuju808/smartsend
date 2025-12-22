// Block 22390 — SmartSend Roofing Crew Capacity Engine v1
// API Route: Check Crew Capacity Before Scheduling
// POST /api/scheduling/check-capacity

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
    const { job_id, crew_id, start_date, end_date } = body;

    if (!job_id || !crew_id || !start_date) {
      return NextResponse.json(
        { error: "Missing required params: job_id, crew_id, start_date" },
        { status: 400 }
      );
    }

    // Verify job belongs to user's workspace
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id, scheduled_duration_days, labor_effort")
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
      .select("id, daily_capacity, workspace_id")
      .eq("id", crew_id)
      .eq("workspace_id", job.workspace_id)
      .single();

    if (crewError || !crew) {
      return NextResponse.json(
        { error: "Crew not found" },
        { status: 404 }
      );
    }

    // Use database function to check capacity
    const { data: capacityCheck, error: checkError } = await supabase
      .rpc("check_crew_capacity", {
        p_crew_id: crew_id,
        p_job_id: job_id,
        p_start_date: start_date,
        p_end_date: end_date || null,
      });

    if (checkError) {
      console.error("Error checking capacity:", checkError);
      return NextResponse.json(
        { error: checkError.message || "Failed to check capacity" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      capacityCheck,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in check capacity API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































