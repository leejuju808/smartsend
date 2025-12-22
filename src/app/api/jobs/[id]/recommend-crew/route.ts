// Block 34044 — Smart Crew Assignment Recommendations
// GET: Get recommended crews for a job based on skills and availability

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id, stage")
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get job schedule to find install date
    const { data: schedule } = await supabase
      .from("job_schedule")
      .select("start_date")
      .eq("job_id", params.id)
      .single();

    const installDate = schedule?.start_date || new Date().toISOString().slice(0, 10);

    // Get team's workspace_id
    const { data: team } = await supabase
      .from("teams")
      .select("workspace_id")
      .eq("id", job.team_id)
      .single();

    if (!team) {
      return NextResponse.json(
        { error: "Team/workspace not found" },
        { status: 404 }
      );
    }

    // Call the helper function to get available crews
    const { data: recommendations, error } = await supabase.rpc(
      "get_available_crews",
      {
        p_workspace_id: team.workspace_id,
        p_job_date: installDate,
        p_required_skills: [], // Could be enhanced to extract from job metadata
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Sort by availability and skill match
    const sorted = (recommendations || []).sort((a: any, b: any) => {
      if (a.is_available !== b.is_available) {
        return a.is_available ? -1 : 1;
      }
      return b.skill_match_score - a.skill_match_score;
    });

    return NextResponse.json({
      recommendations: sorted,
      install_date: installDate,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

































