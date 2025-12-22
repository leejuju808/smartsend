// Block 51000 — SmartSend Roofing Crew Payroll + Labor Cost Tracking System v1
// API Route: Payroll Dashboard
// GET /api/payroll/dashboard?workspace_id=xxx&period=week|month

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const period = searchParams.get("period") || "week";

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    if (period === "week") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "month") {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    // Get payroll summary
    const { data: payrollRuns, error: runsError } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("period_start", startDate.toISOString().split("T")[0])
      .lte("period_end", endDate.toISOString().split("T")[0])
      .order("period_start", { ascending: false });

    if (runsError) {
      return NextResponse.json(
        { error: "Failed to fetch payroll runs", details: runsError.message },
        { status: 500 }
      );
    }

    // Get current period totals
    const { data: timecards, error: timecardsError } = await supabase
      .from("timecards")
      .select("total_hours, overtime_hours, total_pay, job_id")
      .in("member_id", 
        supabase.from("crew_members")
          .select("id")
          .eq("workspace_id", workspace_id)
          .eq("is_active", true)
      )
      .gte("clock_in", startDate.toISOString())
      .eq("status", "completed");

    // Calculate totals
    const totalLaborCost = payrollRuns?.reduce((sum, run) => sum + Number(run.total_labor_cost || 0), 0) || 0;
    const totalOvertime = payrollRuns?.reduce((sum, run) => sum + Number(run.total_overtime_hours || 0), 0) || 0;
    const totalPiecework = payrollRuns?.reduce((sum, run) => sum + Number(run.total_piecework_pay || 0), 0) || 0;

    // Get jobs with highest labor cost
    const { data: jobLaborCosts, error: jobCostsError } = await supabase
      .from("job_labor_cost_summary")
      .select("*")
      .order("total_labor_cost", { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      dashboard: {
        period,
        total_labor_cost: totalLaborCost,
        total_overtime_hours: totalOvertime,
        total_piecework_pay: totalPiecework,
        payroll_runs: payrollRuns || [],
      },
      top_jobs: jobLaborCosts || [],
    });
  } catch (error: any) {
    console.error("Error in payroll dashboard API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
