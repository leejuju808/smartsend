// Block 37444 — SmartSend Roofing Job Costing + Profit Calculator Engine v1
// API Route: Manage crew hours
// GET /api/jobs/[jobId]/crew-hours - List crew hours
// POST /api/jobs/[jobId]/crew-hours - Add crew hours entry

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";

// GET list crew hours
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    // Verify job exists and belongs to team
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", jobId)
      .eq("team_id", teamId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get crew hours
    const { data: crewHours, error: hoursError } = await supabase
      .from("crew_hours")
      .select("*")
      .eq("job_id", jobId)
      .order("start_time", { ascending: false });

    if (hoursError) {
      console.error("Error fetching crew hours:", hoursError);
      return NextResponse.json(
        { error: "Failed to fetch crew hours" },
        { status: 500 }
      );
    }

    return NextResponse.json({ crewHours: crewHours || [] });
  } catch (error: any) {
    console.error("Error in get crew hours route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST add crew hours entry
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      crew_id,
      crew_name,
      start_time,
      end_time,
      hourly_rate,
      crew_size,
      crew_members,
      work_type,
      issues,
    } = body;

    if (!start_time || !hourly_rate) {
      return NextResponse.json(
        { error: "Missing required fields: start_time, hourly_rate" },
        { status: 400 }
      );
    }

    // Verify job exists and belongs to team
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", jobId)
      .eq("team_id", teamId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Insert crew hours entry
    const { data: crewHour, error: insertError } = await supabase
      .from("crew_hours")
      .insert({
        job_id: jobId,
        team_id: teamId,
        crew_id: crew_id || null,
        crew_name: crew_name || null,
        start_time: start_time,
        end_time: end_time || null,
        hourly_rate: parseFloat(hourly_rate),
        crew_size: crew_size ? parseInt(crew_size) : 1,
        crew_members: crew_members || [],
        work_type: work_type || null,
        issues: issues || null,
        logged_by: user?.id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting crew hours:", insertError);
      return NextResponse.json(
        { error: "Failed to add crew hours", details: insertError.message },
        { status: 500 }
      );
    }

    // Profit calculation happens automatically via trigger
    await supabase.rpc("calculate_job_profit", { p_job_id: jobId });

    return NextResponse.json({ crewHour }, { status: 201 });
  } catch (error: any) {
    console.error("Error in post crew hours route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































