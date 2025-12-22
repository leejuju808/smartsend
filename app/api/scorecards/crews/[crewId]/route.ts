// Block 24700 — SmartSend Roofing Supplier & Crew Scorecard v1
// API Route: GET /api/scorecards/crews/[crewId]
// Returns detailed scorecard for a specific crew

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ crewId: string }> }
) {
  try {
    const supabase = createClient();
    const { crewId } = await params;

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

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    // Get scorecard
    const { data: scorecard, error } = await supabase
      .from("crew_scorecards")
      .select(`
        *,
        crews (
          id,
          name,
          color,
          is_active,
          crew_leader_id,
          specialties,
          phone_number,
          email
        )
      `)
      .eq("crew_id", crewId)
      .eq("workspace_id", workspaceMember.workspace_id)
      .single();

    if (error || !scorecard) {
      // If no scorecard exists, calculate it
      const { error: calcError } = await supabase.rpc("calculate_crew_scorecard", {
        p_crew_id: crewId,
      });

      if (calcError) {
        console.error("Error calculating crew scorecard:", calcError);
        return NextResponse.json(
          { error: "Crew scorecard not found and could not be calculated" },
          { status: 404 }
        );
      }

      // Retry fetching
      const { data: newScorecard, error: retryError } = await supabase
        .from("crew_scorecards")
        .select(`
          *,
          crews (
            id,
            name,
            color,
            is_active,
            crew_leader_id,
            specialties,
            phone_number,
            email
          )
        `)
        .eq("crew_id", crewId)
        .eq("workspace_id", workspaceMember.workspace_id)
        .single();

      if (retryError || !newScorecard) {
        return NextResponse.json(
          { error: "Crew scorecard not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        scorecard: formatCrewScorecard(newScorecard),
      });
    }

    return NextResponse.json({
      scorecard: formatCrewScorecard(scorecard),
    });
  } catch (error: any) {
    console.error("Error in GET /api/scorecards/crews/[crewId]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function formatCrewScorecard(sc: any) {
  return {
    id: sc.id,
    crew_id: sc.crew_id,
    crew: sc.crews,
    overall_score: parseFloat(sc.overall_score),
    category_scores: {
      on_time_performance: parseFloat(sc.on_time_performance_score),
      issue_rate: parseFloat(sc.issue_rate_score),
      duration_accuracy: parseFloat(sc.duration_accuracy_score),
      documentation_quality: parseFloat(sc.documentation_quality_score),
      homeowner_feedback: parseFloat(sc.homeowner_feedback_score),
    },
    metrics: {
      total_jobs_completed: sc.total_jobs_completed,
      on_time_jobs_count: sc.on_time_jobs_count,
      late_jobs_count: sc.late_jobs_count,
      total_issues_reported: sc.total_issues_reported,
      total_callbacks: sc.total_callbacks,
      avg_duration_variance_hours: parseFloat(sc.avg_duration_variance_hours || "0"),
    },
    score_details: sc.score_details,
    calculated_at: sc.calculated_at,
    updated_at: sc.updated_at,
  };
}






































