// Block 22270 — SmartSend Roofing Proposal → Job Conversion Flow v1
// API Route: List Jobs
// GET /api/jobs/list

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Fetch jobs from user's workspaces
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select(
        "id, title, status, job_value, scheduled_start_date, scheduled_end_date, created_at"
      )
      .in("workspace_id", workspaceIds)
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      return NextResponse.json(
        { error: jobsError.message || "Failed to fetch jobs" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { jobs: jobs || [] },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in list jobs:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































