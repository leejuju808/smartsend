import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/analytics/ceo-dashboard/sales-funnel
 * 
 * Returns sales funnel metrics and conversion rates
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    // Get funnel metrics
    const { data: funnelMetrics, error } = await supabase
      .from("sales_funnel_metrics")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching sales funnel:", error);
      return NextResponse.json(
        { error: "Failed to fetch sales funnel metrics" },
        { status: 500 }
      );
    }

    // Get top sales reps
    const { data: topReps } = await supabase
      .from("top_sales_reps")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("total_revenue_closed", { ascending: false })
      .limit(10);

    // Calculate conversion rates
    const leadsNew = Number(funnelMetrics?.leads_new || 0);
    const estimatesSent = Number(funnelMetrics?.estimates_sent || 0);
    const contractsSigned = Number(funnelMetrics?.contracts_signed || 0);

    const leadToEstimateRate = leadsNew > 0 
      ? (estimatesSent / leadsNew) * 100 
      : 0;
    const estimateToCloseRate = estimatesSent > 0 
      ? (contractsSigned / estimatesSent) * 100 
      : 0;
    const overallCloseRate = leadsNew > 0 
      ? (contractsSigned / leadsNew) * 100 
      : 0;

    // Get average quote response time (if available)
    const { data: recentLeads } = await supabase
      .from("leads")
      .select("created_at, updated_at, status")
      .eq("workspace_id", workspace_id)
      .in("status", ["estimate_sent", "quote_sent", "contract_signed"])
      .order("created_at", { ascending: false })
      .limit(100);

    let avgQuoteResponseTime = 0;
    if (recentLeads && recentLeads.length > 0) {
      const responseTimes = recentLeads
        .filter(l => l.updated_at && l.created_at)
        .map(l => {
          const created = new Date(l.created_at);
          const updated = new Date(l.updated_at!);
          return (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24); // days
        });
      avgQuoteResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;
    }

    return NextResponse.json({
      funnel: {
        leadsNew,
        estimatesSent,
        contractsSigned,
        lostLeads: Number(funnelMetrics?.lost_leads || 0),
        totalLeads: Number(funnelMetrics?.total_leads || 0),
      },
      conversionRates: {
        leadToEstimate: Number(leadToEstimateRate.toFixed(2)),
        estimateToClose: Number(estimateToCloseRate.toFixed(2)),
        overallClose: Number(overallCloseRate.toFixed(2)),
        closeRatePct: Number(funnelMetrics?.close_rate_pct || 0),
      },
      performance: {
        avgQuoteResponseTimeDays: Number(avgQuoteResponseTime.toFixed(1)),
      },
      topSalesReps: (topReps || []).map((rep) => ({
        repEmail: rep.rep_email,
        repName: rep.rep_name,
        dealsClosed: Number(rep.deals_closed || 0),
        totalLeads: Number(rep.total_leads || 0),
        winRate: Number(rep.win_rate_pct || 0),
        totalRevenue: Number(rep.total_revenue_closed || 0),
        avgDealSize: Number(rep.avg_deal_size || 0),
      })),
    });
  } catch (error: any) {
    console.error("Error fetching sales funnel:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch sales funnel" },
      { status: 500 }
    );
  }
}

























