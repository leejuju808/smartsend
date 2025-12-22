// Block 27880 — SmartSend Roofing Crew Mobile Field App v1
// API Route: Get today's jobs for a crew
// GET /api/crew/[crew_id]/today

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ crew_id: string }> }
) {
  try {
    const { crew_id } = await params;

    if (!crew_id) {
      return NextResponse.json(
        { error: "crew_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const today = new Date().toISOString().slice(0, 10);

    // Get scheduled jobs for today
    const { data: scheduledJobs, error: scheduledError } = await supabase
      .from("roofing_scheduled_jobs")
      .select(`
        *,
        roofing_jobs (
          id,
          title,
          homeowner_name,
          address,
          notes,
          scheduled_start_date,
          scheduled_start
        )
      `)
      .eq("crew_id", crew_id)
      .eq("start_date", today)
      .neq("status", "canceled");

    if (scheduledError) {
      console.error("Error fetching scheduled jobs:", scheduledError);
      return NextResponse.json(
        { error: "Failed to fetch jobs", details: scheduledError.message },
        { status: 500 }
      );
    }

    // Also check if there are jobs assigned via job_crew_assignments for today
    const { data: assignedJobs, error: assignedError } = await supabase
      .from("job_crew_assignments")
      .select(`
        *,
        roofing_jobs (
          id,
          title,
          homeowner_name,
          address,
          notes,
          scheduled_start_date,
          scheduled_start
        )
      `)
      .eq("crew_id", crew_id)
      .is("unassigned_at", null)
      .gte("assigned_at", `${today}T00:00:00Z`)
      .lte("assigned_at", `${today}T23:59:59Z`);

    if (assignedError) {
      console.error("Error fetching assigned jobs:", assignedError);
      // Don't fail, just log
    }

    // Combine and deduplicate jobs
    const jobMap = new Map();
    
    scheduledJobs?.forEach((sj: any) => {
      if (sj.roofing_jobs) {
        jobMap.set(sj.job_id, {
          id: sj.id,
          job_id: sj.job_id,
          start_date: sj.start_date,
          start_time: sj.start_time || null,
          roofing_jobs: sj.roofing_jobs,
        });
      }
    });

    assignedJobs?.forEach((aj: any) => {
      if (aj.roofing_jobs && !jobMap.has(aj.job_id)) {
        jobMap.set(aj.job_id, {
          id: aj.id,
          job_id: aj.job_id,
          start_date: aj.roofing_jobs.scheduled_start_date || aj.roofing_jobs.scheduled_start || today,
          start_time: null,
          roofing_jobs: aj.roofing_jobs,
        });
      }
    });

    const jobs = Array.from(jobMap.values());

    return NextResponse.json({ jobs });
  } catch (error: any) {
    console.error("Error in crew today jobs API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































