// Block 22158 — SmartSend Roofing "Estimator Coaching Engine v1"
// API route: Get coaching dashboard data for owner view

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Missing required field: workspace_id" },
        { status: 400 }
      );
    }

    // Verify user is a member of this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 }
      );
    }

    // Get leaderboard data with rankings
    const { data: leaderboard, error: leaderboardError } = await supabase
      .from("estimator_leaderboard_view")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("performance_score", { ascending: false, nullsLast: true });

    if (leaderboardError) {
      console.error("Error fetching leaderboard:", leaderboardError);
      return NextResponse.json(
        { error: "Failed to fetch leaderboard data" },
        { status: 500 }
      );
    }

    // Get latest coaching reports for each estimator
    const estimatorIds = (leaderboard || []).map((e) => e.estimator_id);

    if (estimatorIds.length === 0) {
      return NextResponse.json({ estimators: [] });
    }

    // Get latest weekly coaching reports
    const { data: coachingReports, error: coachingError } = await supabase
      .from("estimator_coaching_reports")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("report_type", "weekly")
      .in("estimator_id", estimatorIds)
      .order("week_end", { ascending: false });

    if (coachingError) {
      console.error("Error fetching coaching reports:", coachingError);
      // Continue without coaching data rather than failing
    }

    // Group coaching reports by estimator_id (get latest for each)
    const coachingByEstimator = new Map<string, any>();
    (coachingReports || []).forEach((report) => {
      if (!coachingByEstimator.has(report.estimator_id)) {
        coachingByEstimator.set(report.estimator_id, report);
      }
    });

    // Combine leaderboard data with coaching reports
    const estimators = (leaderboard || []).map((estimator, index) => {
      const coaching = coachingByEstimator.get(estimator.estimator_id);

      return {
        estimator_id: estimator.estimator_id,
        estimator_name: estimator.estimator_name,
        performance_score: estimator.performance_score,
        rank: index + 1,
        revenue_won_30d: estimator.revenue_won_30d || 0,
        close_rate_30d: estimator.close_rate_30d || 0,
        active_jobs: estimator.active_jobs || 0,
        latest_coaching: coaching
          ? {
              id: coaching.id,
              report_type: coaching.report_type,
              top_priority: coaching.top_priority,
              strengths_data: coaching.strengths_data,
              weaknesses_data: coaching.weaknesses_data,
              recommendations: coaching.recommendations,
              week_end: coaching.week_end,
            }
          : null,
      };
    });

    return NextResponse.json({ estimators });
  } catch (error: any) {
    console.error("Error in /api/estimators/coaching-dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}









































