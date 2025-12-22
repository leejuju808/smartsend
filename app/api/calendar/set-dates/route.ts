// Block 22280 — SmartSend Roofing Job Calendar & Crew View v1
// API Route: Set/Update Job Dates
// POST /api/calendar/set-dates

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
    const { job_id, start_date, end_date, crew_id, skip_capacity_check } = body;

    if (!job_id || !start_date) {
      return NextResponse.json(
        { error: "Missing job_id or start_date" },
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

    // Block 22390: Check capacity if crew_id is provided and not skipping check
    if (crew_id && !skip_capacity_check) {
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

    const update: any = {
      scheduled_start_date: start_date,
      updated_at: new Date().toISOString(),
    };

    if (end_date) {
      update.scheduled_end_date = end_date;
    }

    const { error } = await supabase
      .from("roofing_jobs")
      .update(update)
      .eq("id", job_id);

    if (error) {
      console.error("Error updating job dates:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update dates" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in set dates API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

