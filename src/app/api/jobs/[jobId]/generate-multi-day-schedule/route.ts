// Block 47000 — Generate Multi-Day Schedule
// POST: Generate a multi-day schedule for a job

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      duration_days,
      start_date,
      crew_ids,
      tasks_per_day,
    } = body;

    if (!duration_days || duration_days < 1) {
      return NextResponse.json(
        { error: "duration_days must be at least 1" },
        { status: 400 }
      );
    }

    if (!start_date) {
      return NextResponse.json(
        { error: "start_date is required" },
        { status: 400 }
      );
    }

    // Verify job exists (try roofing_jobs first, then jobs)
    let job;
    let jobError;
    
    const { data: roofingJob, error: roofingJobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", params.jobId)
      .single();

    if (roofingJob) {
      job = roofingJob;
    } else {
      const { data: regularJob, error: regularJobError } = await supabase
        .from("jobs")
        .select("id, team_id")
        .eq("id", params.jobId)
        .single();
      
      job = regularJob;
      jobError = regularJobError;
    }

    if ((jobError && roofingJobError) || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Validate crew_ids if provided
    if (crew_ids && Array.isArray(crew_ids) && crew_ids.length > 0) {
      const { data: crews, error: crewsError } = await supabase
        .from("crews")
        .select("id")
        .in("id", crew_ids);

      if (crewsError || !crews || crews.length !== crew_ids.length) {
        return NextResponse.json(
          { error: "One or more crew_ids are invalid" },
          { status: 400 }
        );
      }
    }

    // Call the database function to generate schedule
    const { data: schedule, error: scheduleError } = await supabase.rpc(
      "generate_multi_day_schedule",
      {
        p_job_id: params.jobId,
        p_duration_days: duration_days,
        p_start_date: start_date,
        p_crew_ids: crew_ids || null,
        p_tasks_per_day: tasks_per_day || null,
      }
    );

    if (scheduleError) {
      console.error("Schedule generation error:", scheduleError);
      return NextResponse.json(
        { error: scheduleError.message || "Failed to generate schedule" },
        { status: 400 }
      );
    }

    // Check for conflicts after generation
    const { data: conflicts } = await supabase.rpc(
      "detect_crew_day_conflicts",
      {
        p_workspace_id: job.workspace_id || null,
        p_date_from: start_date,
        p_date_to: new Date(start_date).toISOString().split('T')[0],
      }
    );

    return NextResponse.json({
      schedule: schedule || [],
      conflicts: conflicts || [],
      message: `Generated ${duration_days}-day schedule starting ${start_date}`,
    }, { status: 201 });
  } catch (error: any) {
    console.error("Generate multi-day schedule error:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
































