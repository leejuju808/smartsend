/**
 * Block 93000 — Attribution Dashboard API
 * Returns aggregated attribution metrics for dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId, supabase } = await getUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get source performance
    const { data: sourcePerformance, error: sourceError } = await supabase
      .from("v_lead_source_performance")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("total_revenue", { ascending: false });

    if (sourceError) throw sourceError;

    // Get campaign performance
    const { data: campaignPerformance, error: campaignError } = await supabase
      .from("v_campaign_performance")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("total_revenue", { ascending: false });

    if (campaignError) throw campaignError;

    // Get time-series data for charts
    const { data: timeSeries, error: timeSeriesError } = await supabase
      .rpc("get_attribution_time_series", {
        p_workspace_id: workspaceId,
        p_days: days,
      })
      .catch(() => {
        // If function doesn't exist, return empty array
        return { data: [], error: null };
      });

    // Calculate totals
    const totals = {
      total_leads: sourcePerformance?.reduce((sum, s) => sum + (s.total_leads || 0), 0) || 0,
      booked_estimates: sourcePerformance?.reduce((sum, s) => sum + (s.booked_estimates || 0), 0) || 0,
      jobs_won: sourcePerformance?.reduce((sum, s) => sum + (s.jobs_won || 0), 0) || 0,
      total_revenue: sourcePerformance?.reduce((sum, s) => sum + (parseFloat(s.total_revenue) || 0), 0) || 0,
      total_cost: sourcePerformance?.reduce((sum, s) => sum + (parseFloat(s.total_cost) || 0), 0) || 0,
    };

    const overallROI =
      totals.total_cost > 0
        ? ((totals.total_revenue - totals.total_cost) / totals.total_cost) * 100
        : null;

    return NextResponse.json({
      totals: {
        ...totals,
        roi: overallROI ? Math.round(overallROI * 100) / 100 : null,
        close_rate:
          totals.total_leads > 0
            ? Math.round((totals.booked_estimates / totals.total_leads) * 100 * 100) / 100
            : 0,
        cost_per_booked:
          totals.booked_estimates > 0
            ? Math.round((totals.total_cost / totals.booked_estimates) * 100) / 100
            : null,
        cost_per_job:
          totals.jobs_won > 0
            ? Math.round((totals.total_cost / totals.jobs_won) * 100) / 100
            : null,
      },
      source_performance: sourcePerformance || [],
      campaign_performance: campaignPerformance || [],
      time_series: timeSeries || [],
    });
  } catch (error: any) {
    console.error("Attribution dashboard API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch attribution dashboard data" },
      { status: 500 }
    );
  }
}



























