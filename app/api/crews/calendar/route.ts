// Block 27820 — SmartSend Roofing Labor & Crew Scheduling Automation v1
// GET /api/crews/calendar
// Returns crew calendar data for the weekly schedule page

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all active crews for this workspace
    const { data: crews, error: crewsError } = await supabase
      .from("crews")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (crewsError) {
      console.error("Error fetching crews:", crewsError);
      return NextResponse.json(
        { error: "Failed to fetch crews", details: crewsError.message },
        { status: 500 }
      );
    }

    // Get all scheduled jobs with job details
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_scheduled_jobs")
      .select(`
        *,
        roofing_jobs (
          id,
          job_name,
          title,
          homeowner_name,
          address,
          job_value
        )
      `)
      .in("crew_id", crews?.map(c => c.id) || [])
      .neq("status", "canceled")
      .order("start_date", { ascending: true });

    if (jobsError) {
      console.error("Error fetching scheduled jobs:", jobsError);
      return NextResponse.json(
        { error: "Failed to fetch scheduled jobs", details: jobsError.message },
        { status: 500 }
      );
    }

    // Get weekly money report
    const { data: weeklyMoney, error: moneyError } = await supabase
      .from("roofing_crew_weekly_money")
      .select("*")
      .in("crew_id", crews?.map(c => c.id) || [])
      .gte("week", new Date().toISOString().split("T")[0])
      .order("week", { ascending: true })
      .order("crew_id", { ascending: true });

    if (moneyError) {
      console.error("Error fetching weekly money:", moneyError);
      // Don't fail if this view doesn't exist yet
    }

    return NextResponse.json({
      crews: crews || [],
      jobs: jobs || [],
      weeklyMoney: weeklyMoney || []
    });
  } catch (error: any) {
    console.error("Error in crews/calendar:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



































