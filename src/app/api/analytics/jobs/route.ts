import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/analytics/jobs
 * 
 * Returns job analytics including:
 * - Average time in each pipeline stage
 * - Average install duration
 * - Job delays
 * - Job profitability
 * - Job quality scores
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const dateRange = searchParams.get("dateRange") || "30d";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get stage durations
    const { data: stageDurations, error: stageError } = await supabase
      .from("v_job_stage_durations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("stage");

    // Get job profitability
    const { data: profitability, error: profitError } = await supabase
      .from("v_job_profitability")
      .select("*")
      .eq("workspace_id", workspaceId);

    // Get job delays summary
    const { data: delaysSummary, error: delaysError } = await supabase
      .from("v_job_delays_summary")
      .select("*")
      .eq("workspace_id", workspaceId);

    // Get install duration by crew
    const { data: crewPerformance, error: crewError } = await supabase
      .from("v_crew_performance")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("avg_install_hours");

    // Calculate average install duration
    const avgInstallDuration = crewPerformance?.reduce(
      (sum, crew) => sum + (crew.avg_install_hours || 0),
      0
    ) / (crewPerformance?.length || 1);

    // Get profitability breakdown
    const insuranceJobs = profitability?.filter((p) => p.carrier).length || 0;
    const retailJobs = profitability?.filter((p) => !p.carrier).length || 0;
    const avgInsuranceMargin =
      profitability?.reduce(
        (sum, p) => sum + (p.avg_insurance_margin || 0),
        0
      ) / (insuranceJobs || 1) || 0;
    const avgRetailMargin =
      profitability?.reduce(
        (sum, p) => sum + (p.avg_retail_margin || 0),
        0
      ) / (retailJobs || 1) || 0;

    return NextResponse.json({
      stageDurations: stageDurations || [],
      profitability: {
        insuranceJobs,
        retailJobs,
        avgInsuranceMargin,
        avgRetailMargin,
        avgJobValue:
          profitability?.reduce((sum, p) => sum + (p.avg_job_value || 0), 0) /
            (profitability?.length || 1) || 0,
        totalProfit:
          profitability?.reduce((sum, p) => sum + (p.total_profit || 0), 0) ||
          0,
      },
      delays: delaysSummary || [],
      crewPerformance: crewPerformance || [],
      avgInstallDuration,
    });
  } catch (error) {
    console.error("Error fetching job analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch job analytics" },
      { status: 500 }
    );
  }
}




































