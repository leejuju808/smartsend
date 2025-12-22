// Block 67000 — SmartSend Roofing "AI Crew Training Insights + Skill Gap Detection System" v1
// API Route: /api/crew/rank
// GET - Ranks all crews based on quality, speed, complaints, risk, warranty probability

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Use the view we created
    const { data: rankings, error: rankingsError } = await supabase
      .from("v_crew_rankings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("ranking_score", { ascending: true });

    if (rankingsError) {
      console.error("Error fetching crew rankings:", rankingsError);
      // Fallback to manual calculation if view doesn't exist yet
      return await calculateRankingsManually(supabase, workspaceId);
    }

    // Add rank number
    const rankedCrews = rankings.map((crew, index) => ({
      rank: index + 1,
      ...crew,
      ranking_breakdown: {
        quality_contribution: ((100 - (crew.avg_quality_score || 0)) * 0.3).toFixed(1),
        speed_contribution: (Math.min((crew.avg_completion_days || 0) * 10, 100) * 0.2).toFixed(1),
        complaints_contribution: (Math.min((crew.high_severity_alerts_count || 0) * 10, 100) * 0.25).toFixed(1),
        risk_contribution: ((crew.avg_risk_score || 0) * 0.15).toFixed(1),
        warranty_contribution: ((crew.avg_warranty_probability || 0) * 0.1).toFixed(1)
      }
    }));

    return NextResponse.json({
      success: true,
      crews: rankedCrews,
      total_crews: rankedCrews.length,
      ranking_criteria: {
        quality_weight: "30%",
        speed_weight: "20%",
        complaints_weight: "25%",
        risk_weight: "15%",
        warranty_weight: "10%"
      }
    });
  } catch (error: any) {
    console.error("Error in crew rank route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function calculateRankingsManually(supabase: any, workspaceId: string) {
  // Manual calculation fallback
  const { data: crews } = await supabase
    .from("crews")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  if (!crews || crews.length === 0) {
    return NextResponse.json({
      success: true,
      crews: [],
      total_crews: 0
    });
  }

  const crewRankings = await Promise.all(
    crews.map(async (crew: any) => {
      // Get completed jobs
      const { data: jobs } = await supabase
        .from("roofing_jobs")
        .select("*")
        .eq("crew_id", crew.id)
        .eq("status", "completed");

      // Get skill scores
      const { data: skillScores } = await supabase
        .from("crew_skill_scores")
        .select("overall")
        .eq("crew_id", crew.id)
        .not("overall", "is", null);

      const avgQuality = skillScores && skillScores.length > 0
        ? skillScores.reduce((sum, s) => sum + (s.overall || 0), 0) / skillScores.length
        : 0;

      // Calculate speed
      const jobIds = jobs?.map((j: any) => j.id) || [];
      let avgCompletionDays = 0;
      if (jobs && jobs.length > 0) {
        const delays = jobs
          .filter((j: any) => j.scheduled_start_date && j.scheduled_end_date)
          .map((job: any) => {
            const scheduled = new Date(job.scheduled_end_date).getTime() - new Date(job.scheduled_start_date).getTime();
            const actual = job.completed_at
              ? new Date(job.completed_at).getTime() - new Date(job.scheduled_start_date).getTime()
              : scheduled;
            return (actual - scheduled) / (1000 * 60 * 60 * 24);
          });
        avgCompletionDays = delays.length > 0
          ? delays.reduce((a, b) => a + b, 0) / delays.length
          : 0;
      }

      // Get risk alerts
      const { data: alerts } = await supabase
        .from("risk_alerts")
        .select("id")
        .in("job_id", jobIds)
        .in("severity", ["high", "critical"]);

      const highSeverityCount = alerts?.length || 0;

      // Get risk assessments
      const { data: riskAssessments } = await supabase
        .from("risk_assessments")
        .select("risk_score, warranty_risk")
        .in("job_id", jobIds);

      const avgRisk = riskAssessments && riskAssessments.length > 0
        ? riskAssessments.reduce((sum, r) => sum + (r.risk_score || 0), 0) / riskAssessments.length
        : 0;

      const avgWarrantyProb = riskAssessments && riskAssessments.length > 0
        ? riskAssessments
            .filter((r: any) => r.warranty_risk?.probability)
            .reduce((sum: number, r: any) => sum + (parseFloat(r.warranty_risk.probability) || 0), 0) /
          riskAssessments.filter((r: any) => r.warranty_risk?.probability).length || 0
        : 0;

      const rankingScore = (
        (100 - avgQuality) * 0.3 +
        Math.min(avgCompletionDays * 10, 100) * 0.2 +
        Math.min(highSeverityCount * 10, 100) * 0.25 +
        avgRisk * 0.15 +
        avgWarrantyProb * 0.1
      );

      return {
        crew_id: crew.id,
        workspace_id: workspaceId,
        crew_name: crew.name,
        avg_quality_score: Math.round(avgQuality * 100) / 100,
        avg_completion_days: Math.round(avgCompletionDays * 100) / 100,
        high_severity_alerts_count: highSeverityCount,
        avg_risk_score: Math.round(avgRisk * 100) / 100,
        avg_warranty_probability: Math.round(avgWarrantyProb * 100) / 100,
        jobs_completed_count: jobs?.length || 0,
        ranking_score: Math.round(rankingScore * 100) / 100
      };
    })
  );

  crewRankings.sort((a, b) => a.ranking_score - b.ranking_score);

  const rankedCrews = crewRankings.map((crew, index) => ({
    rank: index + 1,
    ...crew
  }));

  return NextResponse.json({
    success: true,
    crews: rankedCrews,
    total_crews: rankedCrews.length
  });
}




























