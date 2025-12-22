// Block 22960 — SmartSend Roofing KPI Dashboard v1
// API Route: Get KPI Data
// GET /api/kpi?workspace_id=xxx&period=month|quarter|year

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
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
    const workspace_id = searchParams.get("workspace_id");
    const period = searchParams.get("period") || "month";

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    let endDate = new Date();

    switch (period) {
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case "quarter":
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "year":
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case "month":
      default:
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    // ============================================================
    // 1. COMPANY REVENUE METRICS
    // ============================================================
    const { data: revenueData, error: revenueError } = await supabase
      .from("kpi_company_revenue")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("month", startDate.toISOString().split('T')[0])
      .order("month", { ascending: false });

    // ============================================================
    // 2. JOB MARGIN METRICS
    // ============================================================
    const { data: marginData, error: marginError } = await supabase
      .from("kpi_job_margin")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("month", startDate.toISOString().split('T')[0]);

    // Calculate margin aggregates
    const margins = marginData?.map(m => Number(m.margin_pct || 0)) || [];
    const avgMargin = margins.length > 0
      ? margins.reduce((sum, m) => sum + m, 0) / margins.length
      : 0;
    const jobsUnder30 = margins.filter(m => m < 30).length;
    const jobsOver45 = margins.filter(m => m > 45).length;

    // ============================================================
    // 3. CREW EFFICIENCY METRICS
    // ============================================================
    const { data: crewData, error: crewError } = await supabase
      .from("kpi_crew_efficiency")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("productivity_score", { ascending: false });

    // Find best crew
    const bestCrew = crewData && crewData.length > 0
      ? crewData.reduce((best, crew) =>
          Number(crew.productivity_score || 0) > Number(best.productivity_score || 0)
            ? crew
            : best
        )
      : null;

    const avgHoursPerJob = crewData && crewData.length > 0
      ? crewData.reduce((sum, c) => sum + Number(c.avg_hours_per_session || 0), 0) / crewData.length
      : 0;

    const totalJobsCompleted = crewData?.reduce((sum, c) => sum + Number(c.total_jobs || 0), 0) || 0;

    // ============================================================
    // 4. SALES METRICS
    // ============================================================
    const { data: salesData, error: salesError } = await supabase
      .from("kpi_sales_metrics")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("month", startDate.toISOString().split('T')[0])
      .order("month", { ascending: false });

    // Aggregate sales metrics
    const totalLeads = salesData?.reduce((sum, s) => sum + Number(s.leads_generated || 0), 0) || 0;
    const totalEstimates = salesData?.reduce((sum, s) => sum + Number(s.estimates_sent || 0), 0) || 0;
    const totalWon = salesData?.reduce((sum, s) => sum + Number(s.jobs_won || 0), 0) || 0;
    const avgCloseRate = salesData && salesData.length > 0
      ? salesData.reduce((sum, s) => sum + Number(s.close_rate_pct || 0), 0) / salesData.length
      : 0;
    const avgRevenuePerLead = salesData && salesData.length > 0
      ? salesData.reduce((sum, s) => sum + Number(s.revenue_per_lead || 0), 0) / salesData.length
      : 0;

    // ============================================================
    // 5. SUPPLIER METRICS
    // ============================================================
    const { data: supplierData, error: supplierError } = await supabase
      .from("kpi_supplier_performance")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("on_time_rate", { ascending: false });

    const avgOnTimeRate = supplierData && supplierData.length > 0
      ? supplierData.reduce((sum, s) => sum + Number(s.on_time_rate || 0), 0) / supplierData.length
      : 0;

    const avgDelayDays = supplierData && supplierData.length > 0
      ? supplierData.reduce((sum, s) => sum + Number(s.avg_delay_days || 0), 0) / supplierData.length
      : 0;

    // ============================================================
    // 6. TRENDS (from snapshots)
    // ============================================================
    const { data: snapshots, error: snapshotsError } = await supabase
      .from("kpi_snapshots")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("snapshot_date", startDate.toISOString().split('T')[0])
      .order("snapshot_date", { ascending: true });

    // ============================================================
    // 7. AI INSIGHTS
    // ============================================================
    const { data: insights, error: insightsError } = await supabase
      .from("ai_insights")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      revenue: {
        current: revenueData?.[0] || null,
        trends: revenueData || [],
      },
      margin: {
        avg_margin: avgMargin,
        jobs_under_30: jobsUnder30,
        jobs_over_45: jobsOver45,
        trends: marginData || [],
      },
      crew: {
        best_crew: bestCrew,
        avg_hours_per_job: avgHoursPerJob,
        total_jobs_completed: totalJobsCompleted,
        all_crews: crewData || [],
      },
      sales: {
        leads_generated: totalLeads,
        estimates_sent: totalEstimates,
        jobs_won: totalWon,
        close_rate_pct: avgCloseRate,
        revenue_per_lead: avgRevenuePerLead,
        trends: salesData || [],
      },
      supplier: {
        avg_on_time_rate: avgOnTimeRate,
        avg_delay_days: avgDelayDays,
        suppliers: supplierData || [],
      },
      trends: snapshots?.map(s => ({
        date: s.snapshot_date,
        metrics: s.metrics,
      })) || [],
      ai_insights: insights || [],
    });
  } catch (error: any) {
    console.error("Error in KPI API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































