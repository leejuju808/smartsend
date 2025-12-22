import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/analytics/owner
 * 
 * Returns owner analytics dashboard with aggregated metrics:
 * - Monthly Revenue
 * - Profit Margin
 * - Hot Leads Count
 * - Jobs at Risk
 * - Avg Days to Complete Jobs
 * - Material Waste Trends
 * - Weather Impact Score
 * - Supplier Performance
 * - Crew Efficiency
 * - Insurance Payout Speed
 * - Sales Rep Rankings
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get owner dashboard view
    const { data: dashboard, error: dashboardError } = await supabase
      .from("v_owner_dashboard")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    // Get additional metrics not in view
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Monthly Revenue
    const { data: monthlyRevenue, error: revenueError } = await supabase
      .from("roofing_jobs")
      .select("projected_job_value")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .eq("current_stage", "COMPLETED")
      .gte("updated_at", `${currentMonth}-01`);

    const monthlyRevenueValue =
      monthlyRevenue?.reduce(
        (sum, j) => sum + (Number(j.projected_job_value) || 0),
        0
      ) || 0;

    // Profit Margin
    const { data: profitMargin, error: marginError } = await supabase
      .from("roofing_jobs")
      .select("actual_margin_pct")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .eq("current_stage", "COMPLETED")
      .not("actual_margin_pct", "is", null);

    const profitMarginRows = profitMargin ?? [];
    const avgProfitMargin =
      profitMarginRows.reduce((sum: number, j: any) => sum + (Number(j.actual_margin_pct) || 0), 0) /
        (profitMarginRows.length || 1) || 0;

    // Hot Leads Count
    const { data: hotLeads, error: hotLeadsError } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .gte("quality_score", 70)
      .eq("status", "new");

    const hotLeadsCount = hotLeads?.length || 0;

    // Jobs at Risk
    const { data: jobsAtRisk, error: riskError } = await supabase
      .from("roofing_jobs")
      .select("id")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .in("current_stage", ["CLAIM_PENDING", "ADJUSTER_SCHEDULED"])
      .lt("stage_changed_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

    const jobsAtRiskCount = jobsAtRisk?.length || 0;

    // Avg Days to Complete Jobs
    const { data: completedJobs, error: completedError } = await supabase
      .from("roofing_jobs")
      .select("created_at, updated_at")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .eq("current_stage", "COMPLETED");

    const completedJobRows = completedJobs ?? [];
    const avgDaysToComplete =
      completedJobRows.reduce((sum: number, j: any) => {
        const days =
          (new Date(j.updated_at).getTime() -
            new Date(j.created_at).getTime()) /
          (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0) / (completedJobRows.length || 1) || 0;

    // Material Waste Trends
    const { data: materialWaste, error: wasteError } = await supabase
      .from("roofing_jobs")
      .select("actual_material_cost, est_material_cost")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .not("actual_material_cost", "is", null)
      .not("est_material_cost", "is", null);

    const highWasteJobs =
      materialWaste?.filter(
        (j) =>
          Number(j.actual_material_cost) >
          Number(j.est_material_cost) * 1.1
      ).length || 0;

    // Crew Efficiency
    const { data: crewEfficiency, error: crewError } = await supabase
      .from("roofing_jobs")
      .select("install_duration_hours")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .not("install_duration_hours", "is", null);

    const crewRows = crewEfficiency ?? [];
    const avgCrewHours =
      crewRows.reduce((sum: number, j: any) => sum + (Number(j.install_duration_hours) || 0), 0) /
        (crewRows.length || 1) || 0;

    // Sales Rep Rankings
    const { data: salesReps, error: repsError } = await supabase
      .from("v_sales_team_performance")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("total_revenue", { ascending: false })
      .limit(3);

    return NextResponse.json({
      monthlyRevenue: monthlyRevenueValue,
      profitMargin: avgProfitMargin,
      hotLeadsCount,
      jobsAtRisk: jobsAtRiskCount,
      avgDaysToComplete: Math.round(avgDaysToComplete * 10) / 10,
      materialWasteTrends: {
        highWasteJobs,
        totalJobsTracked: materialWaste?.length || 0,
      },
      weatherImpactScore: 1.0, // Placeholder
      supplierPerformance: {
        issuesCount: 0, // Placeholder
      },
      crewEfficiency: {
        avgHours: Math.round(avgCrewHours * 10) / 10,
        jobsTracked: crewEfficiency?.length || 0,
      },
      insurancePayoutSpeed: {
        avgDays: 0, // Placeholder
      },
      topSalesReps: salesReps?.map((rep) => ({
        repEmail: rep.rep_email,
        totalRevenue: rep.total_revenue,
        winRate: rep.close_rate_pct,
      })) || [],
    });
  } catch (error) {
    console.error("Error fetching owner analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch owner analytics" },
      { status: 500 }
    );
  }
}




































