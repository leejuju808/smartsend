// Block 254000 — SmartSend Productivity Engine v1
// API Route: Daily Productivity Dashboard
// GET /api/productivity/dashboard?workspace_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate
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
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get today's productivity score (average of all active crews)
    const { data: crewScores, error: scoresError } = await supabase
      .from("crew_efficiency_scores")
      .select("score, crew_id, rating_tier")
      .eq("workspace_id", workspace_id)
      .eq("period_end", new Date().toISOString().split("T")[0])
      .order("score", { ascending: false });

    const avgProductivityScore =
      crewScores && crewScores.length > 0
        ? Math.round(
            crewScores.reduce((sum, s) => sum + s.score, 0) / crewScores.length
          )
        : 0;

    // Get crew rankings
    const { data: crews, error: crewsError } = await supabase
      .from("crews")
      .select("id, name")
      .eq("workspace_id", workspace_id)
      .eq("is_active", true);

    const crewRankings = (crewScores || [])
      .map((score) => {
        const crew = crews?.find((c) => c.id === score.crew_id);
        return {
          crew_id: score.crew_id,
          crew_name: crew?.name || "Unknown Crew",
          score: score.score,
          rating_tier: score.rating_tier,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Get jobs behind schedule
    const { data: bottlenecks, error: bottlenecksError } = await supabase
      .from("productivity_bottlenecks")
      .select(
        `
        id,
        job_id,
        crew_id,
        bottleneck_type,
        severity,
        description,
        estimated_delay_minutes,
        detected_at
      `
      )
      .eq("workspace_id", workspace_id)
      .eq("resolved", false)
      .order("detected_at", { ascending: false })
      .limit(10);

    // Get job details for bottlenecks
    const jobIds = bottlenecks
      ?.map((b) => b.job_id)
      .filter((id): id is string => id !== null) || [];

    let jobsBehindSchedule: any[] = [];
    if (jobIds.length > 0) {
      // Try both jobs tables
      const { data: jobs1 } = await supabase
        .from("jobs")
        .select("id, title, address")
        .in("id", jobIds);

      const { data: jobs2 } = await supabase
        .from("roofing_jobs")
        .select("id, title")
        .in("id", jobIds);

      const allJobs = [...(jobs1 || []), ...(jobs2 || [])];

      jobsBehindSchedule = (bottlenecks || []).map((bottleneck) => {
        const job = allJobs.find((j) => j.id === bottleneck.job_id);
        return {
          job_id: bottleneck.job_id,
          job_title: job?.title || `Job ${bottleneck.job_id?.substring(0, 8)}`,
          bottleneck_type: bottleneck.bottleneck_type,
          severity: bottleneck.severity,
          description: bottleneck.description,
          estimated_delay_minutes: bottleneck.estimated_delay_minutes,
        };
      });
    }

    return NextResponse.json({
      success: true,
      today_productivity_score: avgProductivityScore,
      crew_rankings: crewRankings,
      jobs_behind_schedule: jobsBehindSchedule,
      total_crews: crewRankings.length,
      flagged_crews: crewRankings.filter(
        (c) => c.rating_tier === "needs_improvement" || c.rating_tier === "high_risk"
      ).length,
    });
  } catch (error: any) {
    console.error("Error in productivity dashboard route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























