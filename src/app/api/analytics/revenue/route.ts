import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/analytics/revenue
 * 
 * Returns revenue analytics including:
 * - Current month revenue
 * - Pending approvals
 * - Jobs scheduled
 * - Revenue forecast
 * - Profitability analytics
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const forecastMonth = searchParams.get("forecastMonth");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get current revenue forecast
    const { data: forecast, error: forecastError } = await supabase.rpc(
      "calculate_revenue_forecast",
      {
        p_workspace_id: workspaceId,
        p_forecast_month: forecastMonth || new Date().toISOString().split("T")[0],
      }
    );

    // Get current month revenue
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { data: currentMonthJobs, error: monthError } = await supabase
      .from("roofing_jobs")
      .select("projected_job_value, actual_gross_profit, actual_margin_pct")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .eq("current_stage", "COMPLETED")
      .gte("updated_at", `${currentMonth}-01`);

    const currentMonthRevenue =
      currentMonthJobs?.reduce(
        (sum, j) => sum + (Number(j.projected_job_value) || 0),
        0
      ) || 0;

    // Get pending approvals
    const { data: pendingApprovals, error: pendingError } = await supabase
      .from("roofing_jobs")
      .select("id, projected_job_value")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .eq("current_stage", "CLAIM_PENDING");

    const pendingCount = pendingApprovals?.length || 0;
    const pendingValue =
      pendingApprovals?.reduce(
        (sum, j) => sum + (Number(j.projected_job_value) || 0),
        0
      ) || 0;

    // Get scheduled jobs
    const { data: scheduledJobs, error: scheduledError } = await supabase
      .from("roofing_jobs")
      .select("id, projected_job_value")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .eq("current_stage", "SCHEDULED_INSTALL");

    const scheduledCount = scheduledJobs?.length || 0;
    const scheduledValue =
      scheduledJobs?.reduce(
        (sum, j) => sum + (Number(j.projected_job_value) || 0),
        0
      ) || 0;

    // Get profitability breakdown
    const { data: profitability, error: profitError } = await supabase
      .from("v_job_profitability")
      .select("*")
      .eq("workspace_id", workspaceId);

    // Profit by source
    const { data: profitBySource, error: sourceError } = await supabase
      .from("roofing_jobs")
      .select("projected_job_value, actual_gross_profit, actual_margin_pct, lead_id")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .eq("current_stage", "COMPLETED")
      .not("lead_id", "is", null);

    // Get lead sources for profit calculation
    const leadIds = profitBySource?.map((j) => j.lead_id).filter(Boolean) || [];
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, source")
      .in("id", leadIds);

    const profitBySourceMap: Record<string, any> = {};
    profitBySource?.forEach((job) => {
      const lead = leads?.find((l) => l.id === job.lead_id);
      const source = lead?.source || "unknown";
      if (!profitBySourceMap[source]) {
        profitBySourceMap[source] = {
          source,
          totalProfit: 0,
          totalRevenue: 0,
          jobCount: 0,
          avgMargin: 0,
        };
      }
      profitBySourceMap[source].totalProfit += Number(job.actual_gross_profit) || 0;
      profitBySourceMap[source].totalRevenue += Number(job.projected_job_value) || 0;
      profitBySourceMap[source].jobCount += 1;
    });

    // Calculate average margins
    Object.keys(profitBySourceMap).forEach((source) => {
      const data = profitBySourceMap[source];
      data.avgMargin =
        data.totalRevenue > 0
          ? (data.totalProfit / data.totalRevenue) * 100
          : 0;
    });

    return NextResponse.json({
      currentMonthRevenue,
      pendingApprovals: {
        count: pendingCount,
        value: pendingValue,
      },
      scheduledJobs: {
        count: scheduledCount,
        value: scheduledValue,
      },
      forecast: forecast || {},
      profitability: {
        avgMargin:
          (currentMonthJobs ?? []).reduce(
            (sum: number, j: any) => sum + (Number(j.actual_margin_pct) || 0),
            0
          ) / ((currentMonthJobs ?? []).length || 1) || 0,
        totalProfit:
          (currentMonthJobs ?? []).reduce(
            (sum: number, j: any) => sum + (Number(j.actual_gross_profit) || 0),
            0
          ) || 0,
        bySource: Object.values(profitBySourceMap),
      },
    });
  } catch (error) {
    console.error("Error fetching revenue analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch revenue analytics" },
      { status: 500 }
    );
  }
}
