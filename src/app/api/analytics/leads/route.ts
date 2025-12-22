import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/analytics/leads
 * 
 * Returns lead analytics including:
 * - Leads by source
 * - Lead quality scores
 * - Response speed metrics
 * - Sales funnel metrics
 * - Win rate by sales rep
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const dateRange = searchParams.get("dateRange") || "30d"; // 7d, 30d, 90d, all

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Calculate date filter
    let dateFilter = "";
    if (dateRange !== "all") {
      const days = parseInt(dateRange.replace("d", ""));
      dateFilter = `AND l.created_at >= NOW() - INTERVAL '${days} days'`;
    }

    // Get leads by source
    const { data: leadsBySource, error: sourceError } = await supabase.rpc(
      "exec_sql",
      {
        query: `
          SELECT 
            workspace_id,
            source,
            total_leads,
            inspections_scheduled,
            quotes_sent,
            jobs_won,
            lead_to_inspection_rate,
            inspection_to_quote_rate,
            quote_to_job_rate,
            avg_response_time_minutes,
            avg_quality_score,
            total_job_value
          FROM public.v_lead_analytics_by_source
          WHERE workspace_id = '${workspaceId}'
          ORDER BY total_leads DESC
        `,
      }
    );

    // Get sales rep performance
    const { data: salesRepPerformance, error: repError } = await supabase.rpc(
      "exec_sql",
      {
        query: `
          SELECT 
            workspace_id,
            assigned_to_user_id,
            rep_email,
            total_leads,
            inspections_scheduled,
            quotes_sent,
            jobs_won,
            win_rate_pct,
            avg_job_value,
            total_job_value,
            avg_response_time_minutes,
            avg_quality_score
          FROM public.v_sales_rep_performance
          WHERE workspace_id = '${workspaceId}'
          ORDER BY total_job_value DESC
        `,
      }
    );

    // Get lead quality distribution
    const { data: qualityDistribution, error: qualityError } = await supabase
      .from("leads")
      .select("quality_score, status")
      .eq("workspace_id", workspaceId)
      .not("quality_score", "is", null);

    const hotLeads = qualityDistribution?.filter(
      (l) => l.quality_score && l.quality_score >= 70
    ).length || 0;
    const warmLeads = qualityDistribution?.filter(
      (l) => l.quality_score && l.quality_score >= 40 && l.quality_score < 70
    ).length || 0;
    const coldLeads = qualityDistribution?.filter(
      (l) => l.quality_score && l.quality_score < 40
    ).length || 0;

    // Get funnel metrics
    const { data: funnelData, error: funnelError } = await supabase
      .from("lead_conversions")
      .select("converted_to_inspection, converted_to_quote, converted_to_job")
      .in(
        "lead_id",
        (
          await supabase
            .from("leads")
            .select("id")
            .eq("workspace_id", workspaceId)
        ).data?.map((l) => l.id) || []
      );

    const totalLeads = funnelData?.length || 0;
    const inspections = funnelData?.filter((f) => f.converted_to_inspection)
      .length || 0;
    const quotes = funnelData?.filter((f) => f.converted_to_quote).length || 0;
    const jobs = funnelData?.filter((f) => f.converted_to_job).length || 0;

    return NextResponse.json({
      leadsBySource: leadsBySource || [],
      salesRepPerformance: salesRepPerformance || [],
      qualityDistribution: {
        hot: hotLeads,
        warm: warmLeads,
        cold: coldLeads,
      },
      funnelMetrics: {
        totalLeads,
        inspections,
        quotes,
        jobs,
        leadToInspectionRate:
          totalLeads > 0 ? (inspections / totalLeads) * 100 : 0,
        inspectionToQuoteRate:
          inspections > 0 ? (quotes / inspections) * 100 : 0,
        quoteToJobRate: quotes > 0 ? (jobs / quotes) * 100 : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching lead analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch lead analytics" },
      { status: 500 }
    );
  }
}




































