// Block 37444 — SmartSend Roofing Job Costing + Profit Calculator Engine v1
// API Route: Manage profit warnings
// GET /api/jobs/[jobId]/warnings - List warnings
// PATCH /api/jobs/[jobId]/warnings/[warningId] - Acknowledge warning

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";

// GET list warnings
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

    const { searchParams } = req.nextUrl;
    const acknowledged = searchParams.get("acknowledged");

    let query = supabase
      .from("profit_warnings")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (acknowledged !== null) {
      query = query.eq("acknowledged", acknowledged === "true");
    }

    const { data: warnings, error: warningsError } = await query;

    if (warningsError) {
      console.error("Error fetching warnings:", warningsError);
      return NextResponse.json(
        { error: "Failed to fetch warnings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ warnings: warnings || [] });
  } catch (error: any) {
    console.error("Error in get warnings route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































