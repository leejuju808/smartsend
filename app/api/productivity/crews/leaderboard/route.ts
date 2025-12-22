// Block 254000 — SmartSend Productivity Engine v1
// API Route: Crew Leaderboard
// GET /api/productivity/crews/leaderboard?workspace_id=xxx&period=30

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
    const periodDays = parseInt(searchParams.get("period") || "30");

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

    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    // Get crew efficiency scores for the period
    const { data: crewScores, error: scoresError } = await supabase
      .from("crew_efficiency_scores")
      .select(
        `
        crew_id,
        score,
        install_speed_score,
        qc_quality_score,
        material_waste_score,
        on_time_rate_score,
        safety_score,
        rating_tier,
        jobs_count,
        period_start,
        period_end
      `
      )
      .eq("workspace_id", workspace_id)
      .gte("period_end", periodStart.toISOString().split("T")[0])
      .lte("period_end", periodEnd.toISOString().split("T")[0])
      .order("score", { ascending: false });

    // Get crew names
    const { data: crews, error: crewsError } = await supabase
      .from("crews")
      .select("id, name")
      .eq("workspace_id", workspace_id)
      .eq("is_active", true);

    const leaderboard = (crewScores || [])
      .map((score, index) => {
        const crew = crews?.find((c) => c.id === score.crew_id);
        return {
          rank: index + 1,
          crew_id: score.crew_id,
          crew_name: crew?.name || "Unknown Crew",
          score: score.score,
          rating_tier: score.rating_tier,
          component_scores: {
            install_speed: score.install_speed_score,
            qc_quality: score.qc_quality_score,
            material_waste: score.material_waste_score,
            on_time_rate: score.on_time_rate_score,
            safety: score.safety_score,
          },
          jobs_count: score.jobs_count,
          period: {
            start: score.period_start,
            end: score.period_end,
          },
        };
      })
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      success: true,
      leaderboard,
      period: {
        days: periodDays,
        start: periodStart.toISOString().split("T")[0],
        end: periodEnd.toISOString().split("T")[0],
      },
    });
  } catch (error: any) {
    console.error("Error in crew leaderboard route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























