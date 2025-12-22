import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/analytics/ceo-dashboard/crews
 * 
 * Returns crew performance metrics
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    // Get crew performance data
    const { data: crewPerformance, error } = await supabase
      .from("crew_performance")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("overall_performance_score", { ascending: false });

    if (error) {
      console.error("Error fetching crew performance:", error);
      return NextResponse.json(
        { error: "Failed to fetch crew performance" },
        { status: 500 }
      );
    }

    // Format response
    const crews = (crewPerformance || []).map((crew) => ({
      crewId: crew.crew_id,
      name: crew.crew_name,
      metrics: {
        safetyScore: Number(crew.avg_safety_score || 0),
        jobsCompleted: Number(crew.jobs_completed || 0),
        totalJobsAssigned: Number(crew.total_jobs_assigned || 0),
        overallScore: Number(crew.overall_performance_score || 0),
        avgHoursPerJob: Number(crew.avg_hours_per_job || 0),
        onTimePercentage: Number(crew.on_time_percentage || 0),
        qualityScore: Number(crew.quality_score || 0),
        revenueGenerated: Number(crew.total_revenue_generated || 0),
      },
      ranking: crew.overall_performance_score >= 80 ? "elite" : 
               crew.overall_performance_score >= 60 ? "reliable" :
               crew.overall_performance_score >= 40 ? "needs_coaching" : "at_risk",
    }));

    return NextResponse.json({
      crews,
      summary: {
        totalCrews: crews.length,
        eliteCrews: crews.filter(c => c.ranking === "elite").length,
        atRiskCrews: crews.filter(c => c.ranking === "at_risk").length,
        avgSafetyScore: crews.length > 0 
          ? crews.reduce((sum, c) => sum + c.metrics.safetyScore, 0) / crews.length 
          : 0,
      },
    });
  } catch (error: any) {
    console.error("Error fetching crew performance:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch crew performance" },
      { status: 500 }
    );
  }
}

























