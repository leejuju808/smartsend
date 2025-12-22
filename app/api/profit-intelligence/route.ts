// Block 257800 — SmartSend Profit Intelligence Engine v1
// API Route: Owner Profit Intelligence Dashboard
// GET /api/profit-intelligence
//
// This route pulls together:
// - Job-level profit (jobs + roofing_jobs)
// - Division profit (residential, commercial, repairs, insurance)
// - Margin alerts & variance alerts
// - Labor cost intelligence (crew efficiency)
// - Material cost intelligence (cost-per-square outliers)
// - Subcontractor profitability signals
// - Profit leaks (simple v1 heuristics)
// - Owner KPIs (profit this month, AR, cashflow, best/worst jobs)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve workspace (same pattern as /api/owner-dashboard)
    const { data: membership, error: memError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memError || !membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspace_id as string;

    // Optional query params: date range
    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // -------- Owner KPI Snapshot (Company Profit, Best/Worst Jobs) --------
    const { data: profitInsights, error: profitInsightsError } =
      await supabase.rpc("get_company_profit_insights", {
        p_workspace_id: workspaceId,
        p_start_date: startDate,
        p_end_date: endDate,
      });

    if (profitInsightsError) {
      console.error("get_company_profit_insights error:", profitInsightsError);
    }

    // AR + cashflow snapshots reused from existing owner dashboard views
    const [{ data: ar }, { data: cfSummary }, { data: cfDaily }] =
      await Promise.all([
        supabase
          .from("roofing_owner_ar_summary")
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        supabase
          .from("roofing_owner_30day_cashflow_summary")
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        supabase
          .from("roofing_owner_30day_cashflow_daily")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("day", { ascending: true }),
      ]);

    // -------- Division Profit (residential / commercial / repairs / insurance) --------
    let divisionQuery = supabase
      .from("division_profit")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("period_start", { ascending: false });

    if (startDate) {
      divisionQuery = divisionQuery.gte("period_start", startDate);
    }
    if (endDate) {
      divisionQuery = divisionQuery.lte("period_end", endDate);
    }

    const { data: divisionProfit, error: divisionError } = await divisionQuery;
    if (divisionError) {
      console.error("division_profit error:", divisionError);
    }

    // -------- Job-Level Profit & Cost-Per-Square Intelligence --------
    const [{ data: jobProfitRows }, { data: cpsRows }] = await Promise.all([
      supabase
        .from("job_profit")
        .select("*")
        .order("margin", { ascending: true })
        .limit(50),
      supabase
        .from("cost_per_square_report")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("cost_per_square", { ascending: false })
        .limit(50),
    ]);

    const avgCostPerSquare =
      cpsRows && cpsRows.length > 0
        ? cpsRows.reduce(
            (sum: number, r: any) =>
              sum + (Number(r.cost_per_square) || 0),
            0
          ) / cpsRows.length
        : 0;

    const materialCostOutliers =
      cpsRows?.filter((r: any) => {
        if (!r.cost_per_square || !avgCostPerSquare) return false;
        const diff = Number(r.cost_per_square) - avgCostPerSquare;
        return diff / avgCostPerSquare > 0.1; // > 10% over avg
      }) ?? [];

    // -------- Margin Alerts & Variance Alerts (Real-Time Margin Alerts) --------
    const [{ data: marginAlerts }, { data: varianceAlerts }] =
      await Promise.all([
        supabase
          .from("margin_alerts")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("job_variance_alerts")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("acknowledged", false)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    // -------- Labor Cost Intelligence (Crew Efficiency) --------
    const { data: crewEfficiency, error: crewError } = await supabase.rpc(
      "get_crew_efficiency",
      {
        p_workspace_id: workspaceId,
      }
    );
    if (crewError) {
      console.error("get_crew_efficiency error:", crewError);
    }

    // Highlight best and worst crews by avg_profit_per_job
    const sortedCrews =
      (crewEfficiency as any[])?.sort(
        (a, b) =>
          (Number(b.avg_profit_per_job) || 0) -
          (Number(a.avg_profit_per_job) || 0)
      ) ?? [];
    const bestCrews = sortedCrews.slice(0, 5);
    const worstCrews = sortedCrews.slice(-5).reverse();

    // -------- Subcontractor Profitability (via subcontractor_performance_dashboard + job_profit) --------
    const { data: subPerf, error: subError } = await supabase
      .from("subcontractor_performance_dashboard")
      .select("*")
      .order("avg_overall_score", { ascending: false })
      .limit(20);

    if (subError) {
      console.error("subcontractor_performance_dashboard error:", subError);
    }

    // NOTE: We don’t yet have a perfect “jobs using this sub” join in one table.
    // For v1 we surface rating, jobs_completed, and outstanding_payments as
    // the primary profitability/health signals.

    // -------- Profit Leak Detector (v1 heuristics) --------
    // Heuristics:
    //  - Jobs with negative net_profit
    //  - Jobs with margin < 20%
    //  - Open high-severity variance alerts
    const profitLeaks: Json[] = [];

    (jobProfitRows || []).forEach((row: any) => {
      const net = Number(row.net_profit) || 0;
      const margin = Number(row.margin) || 0;
      if (net < 0) {
        profitLeaks.push({
          type: "negative_profit_job",
          job_id: row.job_id,
          net_profit: net,
          margin,
        });
      } else if (margin > 0 && margin < 20) {
        profitLeaks.push({
          type: "low_margin_job",
          job_id: row.job_id,
          net_profit: net,
          margin,
        });
      }
    });

    (varianceAlerts || []).forEach((alert: any) => {
      const severity = alert.severity || "medium";
      if (["high", "critical"].includes(severity)) {
        profitLeaks.push({
          type: `variance_${alert.alert_type}`,
          job_id: alert.job_id,
          severity,
          message: alert.message,
        });
      }
    });

    // -------- Owner KPI Block (compressed, owner-ready) --------
    const ownerKpi = {
      company_profit_this_period:
        profitInsights?.total_profit ?? profitInsights?.total_profit ?? 0,
      total_revenue_this_period: profitInsights?.total_revenue ?? 0,
      avg_margin: profitInsights?.average_margin ?? 0,
      most_profitable_job: profitInsights?.most_profitable_job ?? null,
      least_profitable_job: profitInsights?.least_profitable_job ?? null,
      outstanding_ar: ar?.total_ar ?? 0,
      overdue_ar: ar?.overdue_ar ?? 0,
      overdue_invoices_count: ar?.overdue_invoices_count ?? 0,
      cashflow_next_30_days: cfSummary ?? {
        incoming_30d: 0,
        outgoing_30d: 0,
        net_30d: 0,
      },
    };

    return NextResponse.json({
      workspace_id: workspaceId,
      kpis: ownerKpi,
      division_profit: divisionProfit || [],
      job_profit: jobProfitRows || [],
      cost_per_square: {
        avg_cost_per_square,
        outliers: materialCostOutliers,
        sample: cpsRows || [],
      },
      margin_alerts: marginAlerts || [],
      variance_alerts: varianceAlerts || [],
      labor_intelligence: {
        crews: crewEfficiency || [],
        best_crews: bestCrews,
        worst_crews: worstCrews,
      },
      subcontractors: subPerf || [],
      profit_leaks: profitLeaks,
      cashflow_daily: cfDaily || [],
    });
  } catch (error: any) {
    console.error("Profit Intelligence Engine error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}














