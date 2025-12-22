import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

type Alert = {
  id: string;
  type: "warning" | "critical" | "info";
  title: string;
  message: string;
  metric: string;
  value: number | string;
  threshold: number | string;
  actionUrl?: string;
};

/**
 * GET /api/analytics/ceo-dashboard/alerts
 * 
 * Returns active alerts for:
 * - Low close rate
 * - Crew safety score drops
 * - Overdue invoices exceed threshold
 * - Material cost overruns
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const { searchParams } = new URL(req.url);
    const arThreshold = parseFloat(searchParams.get("arThreshold") || "10000");
    const closeRateThreshold = parseFloat(searchParams.get("closeRateThreshold") || "20");
    const safetyThreshold = parseFloat(searchParams.get("safetyThreshold") || "80");
    const supabase = await getServerSupabase();

    const alerts: Alert[] = [];

    // 1. Check close rate
    const { data: funnelMetrics } = await supabase
      .from("sales_funnel_metrics")
      .select("close_rate_pct, leads_new, contracts_signed")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (funnelMetrics && funnelMetrics.close_rate_pct < closeRateThreshold) {
      alerts.push({
        id: "low_close_rate",
        type: "warning",
        title: "Low Close Rate This Week",
        message: `Your close rate is ${funnelMetrics.close_rate_pct.toFixed(1)}%, below the ${closeRateThreshold}% threshold. Only ${funnelMetrics.contracts_signed} out of ${funnelMetrics.leads_new} leads closed.`,
        metric: "Close Rate",
        value: `${funnelMetrics.close_rate_pct.toFixed(1)}%`,
        threshold: `${closeRateThreshold}%`,
        actionUrl: "/dashboard/analytics/ceo-command-center/sales",
      });
    }

    // 2. Check crew safety scores
    const { data: crewPerformance } = await supabase
      .from("crew_performance")
      .select("crew_id, crew_name, avg_safety_score")
      .eq("workspace_id", workspace_id);

    const lowSafetyCrews = (crewPerformance || []).filter(
      (crew: any) => crew.avg_safety_score < safetyThreshold
    );

    if (lowSafetyCrews.length > 0) {
      alerts.push({
        id: "crew_safety_drop",
        type: "critical",
        title: "Crew Safety Score Dropped Below Threshold",
        message: `${lowSafetyCrews.length} crew(s) have safety scores below ${safetyThreshold}: ${lowSafetyCrews.map(c => c.crew_name).join(", ")}`,
        metric: "Safety Score",
        value: `${lowSafetyCrews
          .map((c: any) => `${c.crew_name}: ${c.avg_safety_score.toFixed(1)}`)
          .join(", ")}`,
        threshold: `${safetyThreshold}`,
        actionUrl: "/dashboard/analytics/ceo-command-center/crews",
      });
    }

    // 3. Check overdue invoices
    const { data: arData } = await supabase
      .from("accounts_receivable")
      .select("amount_due")
      .eq("workspace_id", workspace_id);

    const totalOverdue = arData?.reduce(
      (sum: number, inv: any) => sum + Number(inv.amount_due || 0),
      0
    ) || 0;

    if (totalOverdue > arThreshold) {
      alerts.push({
        id: "overdue_invoices_exceeded",
        type: "critical",
        title: "Overdue Invoices Exceed Threshold",
        message: `You have ${formatCurrency(totalOverdue)} in overdue invoices, exceeding your ${formatCurrency(arThreshold)} threshold.`,
        metric: "Overdue A/R",
        value: formatCurrency(totalOverdue),
        threshold: formatCurrency(arThreshold),
        actionUrl: "/dashboard/analytics/ceo-command-center/ar",
      });
    }

    // 4. Check material cost overruns
    const { data: overruns } = await supabase
      .from("material_cost_overruns")
      .select("job_id, overrun_amount, overrun_pct, revenue")
      .eq("workspace_id", workspace_id)
      .limit(10);

    if (overruns && overruns.length > 0) {
      const totalOverrun = overruns.reduce(
        (sum: number, job: any) => sum + Number(job.overrun_amount || 0),
        0
      );

      alerts.push({
        id: "material_cost_overrun",
        type: "warning",
        title: "Material Cost Overrun Detected",
        message: `${overruns.length} job(s) have material costs exceeding estimates by more than 10%. Total overrun: ${formatCurrency(totalOverrun)}.`,
        metric: "Material Overrun",
        value: formatCurrency(totalOverrun),
        threshold: "10% above estimate",
        actionUrl: "/dashboard/analytics/ceo-command-center/jobs",
      });
    }

    // 5. Check for jobs with negative margins
    const { data: negativeMarginJobs } = await supabase
      .from("job_profitability")
      .select("job_id, revenue, gross_profit, margin_pct")
      .eq("workspace_id", workspace_id)
      .lt("margin_pct", 0)
      .limit(10);

    if (negativeMarginJobs && negativeMarginJobs.length > 0) {
      alerts.push({
        id: "negative_margin_jobs",
        type: "critical",
        title: "Jobs with Negative Margins",
        message: `${negativeMarginJobs.length} job(s) are losing money. Review profitability immediately.`,
        metric: "Negative Margin Jobs",
        value: `${negativeMarginJobs.length} jobs`,
        threshold: "0% margin",
        actionUrl: "/dashboard/analytics/ceo-command-center/jobs",
      });
    }

    // 6. Check for low pipeline value
    const { data: revenueSummary } = await supabase
      .from("company_revenue_summary")
      .select("total_revenue, sold_revenue")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    const { data: pipelineJobs } = await supabase
      .from("roofing_jobs")
      .select("job_value")
      .eq("workspace_id", workspace_id)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .in("status", ["scheduled", "in_progress", "approved", "signed"]);

    const pipelineValue = pipelineJobs?.reduce(
      (sum: number, job: any) => sum + Number(job.job_value || 0),
      0
    ) || 0;

    const avgMonthlyRevenue = Number(revenueSummary?.sold_revenue || 0) / 12; // Rough estimate
    if (pipelineValue < avgMonthlyRevenue * 0.5) {
      alerts.push({
        id: "low_pipeline",
        type: "warning",
        title: "Low Pipeline Value",
        message: `Your pipeline value (${formatCurrency(pipelineValue)}) is below 50% of average monthly revenue. Consider increasing sales activity.`,
        metric: "Pipeline Value",
        value: formatCurrency(pipelineValue),
        threshold: `${formatCurrency(avgMonthlyRevenue * 0.5)}`,
        actionUrl: "/dashboard/analytics/ceo-command-center",
      });
    }

    return NextResponse.json({
      alerts,
      summary: {
        total: alerts.length,
        critical: alerts.filter(a => a.type === "critical").length,
        warnings: alerts.filter(a => a.type === "warning").length,
        info: alerts.filter(a => a.type === "info").length,
      },
    });
  } catch (error: any) {
    console.error("Error fetching alerts:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

























