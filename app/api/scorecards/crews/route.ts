// Block 24700 — SmartSend Roofing Supplier & Crew Scorecard v1
// API Route: GET /api/scorecards/crews
// Returns crew scorecards for the authenticated user's workspace

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

    const workspaceId = workspaceMember.workspace_id;

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const sortBy = searchParams.get("sort") || "overall_score"; // overall_score, on_time_performance_score, etc.
    const order = searchParams.get("order") || "desc"; // asc or desc
    const limit = parseInt(searchParams.get("limit") || "50");
    const minScore = searchParams.get("min_score") ? parseFloat(searchParams.get("min_score")!) : null;

    // Build query
    let query = supabase
      .from("crew_scorecards")
      .select(`
        *,
        crews (
          id,
          name,
          color,
          is_active,
          crew_leader_id,
          specialties
        )
      `)
      .eq("workspace_id", workspaceId)
      .order(sortBy, { ascending: order === "asc" })
      .limit(limit);

    if (minScore !== null) {
      query = query.gte("overall_score", minScore);
    }

    const { data: scorecards, error } = await query;

    if (error) {
      console.error("Error fetching crew scorecards:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch crew scorecards" },
        { status: 500 }
      );
    }

    // Format response
    const formattedScorecards = scorecards?.map((sc) => ({
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
    }));

    return NextResponse.json({
      scorecards: formattedScorecards || [],
      count: formattedScorecards?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/scorecards/crews:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































