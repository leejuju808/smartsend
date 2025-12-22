import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { getOutreachSnapshot } from "@/lib/outreach/snapshot";

/**
 * GET /api/analytics/ceo-dashboard/summary
 * 
 * Returns CEO Command Center summary metrics:
 * - Total revenue
 * - Jobs in pipeline
 * - Close rate
 * - Avg job size
 * - AR total
 * - Forecasted revenue
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const outreach = await getOutreachSnapshot(workspace_id);
    if (outreach.state !== "running") {
      return NextResponse.json(
        {
          disabled: true,
          message: "No system running.",
          smartsend: outreach,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const supabase = await getServerSupabase();

    // Get revenue summary
    const { data: revenueSummary } = await supabase
      .from("company_revenue_summary")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    // Get sales funnel metrics
    const { data: funnelMetrics } = await supabase
      .from("sales_funnel_metrics")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    // Get accounts receivable total
    const { data: arData } = await supabase
      .from("accounts_receivable")
      .select("amount_due, days_overdue")
      .eq("workspace_id", workspace_id);

    const arTotal =
      (arData ?? []).reduce((sum: number, inv: any) => sum + Number(inv.amount_due || 0), 0) || 0;
    const overdueCount = (arData ?? []).filter((inv: any) => inv.days_overdue > 0).length || 0;

    // Get revenue forecast
    const { data: forecast } = await supabase
      .from("revenue_forecast")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    // Get jobs in pipeline (scheduled, in_progress, approved)
    const { data: pipelineJobs } = await supabase
      .from("roofing_jobs")
      .select("id, job_value, status")
      .eq("workspace_id", workspace_id)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .in("status", ["scheduled", "in_progress", "approved", "signed"]);

    const jobsInPipeline = pipelineJobs?.length || 0;
    const pipelineValue =
      (pipelineJobs ?? []).reduce((sum: number, job: any) => sum + Number(job.job_value || 0), 0) || 0;

    // Calculate average job size
    const completedJobs = revenueSummary?.completed_jobs_count || 0;
    const completedRevenue = revenueSummary?.completed_revenue || 0;
    const avgJobSize = completedJobs > 0 ? completedRevenue / completedJobs : 0;

    // Get current month revenue
    const currentMonth = new Date();
    const { data: monthlyTrend } = await supabase
      .from("monthly_revenue_trend")
      .select("revenue")
      .eq("workspace_id", workspace_id)
      .gte("month", new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString())
      .lt("month", new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1).toISOString())
      .maybeSingle();

    return NextResponse.json({
      smartsend: outreach,
      revenue: {
        total: Number(revenueSummary?.total_revenue || 0),
        sold: Number(revenueSummary?.sold_revenue || 0),
        completed: Number(revenueSummary?.completed_revenue || 0),
        currentMonth: Number(monthlyTrend?.revenue || 0),
      },
      pipeline: {
        jobsCount: jobsInPipeline,
        value: pipelineValue,
      },
      sales: {
        closeRate: Number(funnelMetrics?.close_rate_pct || 0),
        leadsNew: Number(funnelMetrics?.leads_new || 0),
        estimatesSent: Number(funnelMetrics?.estimates_sent || 0),
        contractsSigned: Number(funnelMetrics?.contracts_signed || 0),
      },
      financial: {
        avgJobSize: avgJobSize,
        arTotal: arTotal,
        overdueInvoices: overdueCount,
      },
      forecast: {
        next30Days: Number(forecast?.forecast_30d || 0) + Number(forecast?.pending_signed_revenue || 0),
        next60Days: Number(forecast?.forecast_60d || 0) + Number(forecast?.pending_signed_revenue || 0),
        next90Days: Number(forecast?.forecast_90d || 0) + Number(forecast?.pending_signed_revenue || 0) + Number(forecast?.estimated_pipeline_revenue || 0),
      },
    });
  } catch (error: any) {
    console.error("Error fetching CEO dashboard summary:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch dashboard summary" },
      { status: 500 }
    );
  }
}
























