// Block 51000 — SmartSend Roofing Crew Payroll + Labor Cost Tracking System v1
// API Route: Create Payroll Run
// POST /api/payroll/run

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { workspace_id, period_start, period_end, pay_date } = body;

    if (!workspace_id || !period_start || !period_end) {
      return NextResponse.json(
        { error: "workspace_id, period_start, and period_end are required" },
        { status: 400 }
      );
    }

    // Create payroll run
    const { data: payrollRun, error: runError } = await supabase
      .from("payroll_runs")
      .insert({
        workspace_id,
        period_start,
        period_end,
        pay_date: pay_date || period_end,
        status: "processing",
      })
      .select()
      .single();

    if (runError) {
      return NextResponse.json(
        { error: "Failed to create payroll run", details: runError.message },
        { status: 500 }
      );
    }

    // Get all crew members in workspace
    const { data: members, error: membersError } = await supabase
      .from("crew_members")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("is_active", true);

    if (membersError) {
      return NextResponse.json(
        { error: "Failed to fetch crew members", details: membersError.message },
        { status: 500 }
      );
    }

    const memberIds = members?.map((m) => m.id) || [];

    // Get all timecards for period
    const { data: timecards, error: timecardsError } = await supabase
      .from("timecards")
      .select("*")
      .in("member_id", memberIds)
      .gte("clock_in", period_start)
      .lte("clock_in", `${period_end}T23:59:59`)
      .eq("status", "completed");

    if (timecardsError) {
      return NextResponse.json(
        { error: "Failed to fetch timecards", details: timecardsError.message },
        { status: 500 }
      );
    }

    // Get all piecework records for period
    const { data: pieceworkRecords, error: pieceworkError } = await supabase
      .from("piecework_records")
      .select("*")
      .in("member_id", memberIds)
      .gte("created_at", period_start)
      .lte("created_at", `${period_end}T23:59:59`);

    if (pieceworkError) {
      return NextResponse.json(
        { error: "Failed to fetch piecework records", details: pieceworkError.message },
        { status: 500 }
      );
    }

    // Aggregate by member
    const memberTotals: Record<string, any> = {};

    // Process timecards
    timecards?.forEach((tc) => {
      const memberId = tc.member_id;
      if (!memberTotals[memberId]) {
        memberTotals[memberId] = {
          member_id: memberId,
          total_hours: 0,
          regular_hours: 0,
          overtime_hours: 0,
          regular_pay: 0,
          overtime_pay: 0,
          piecework_pay: 0,
          total_pay: 0,
          jobs_worked: new Set<string>(),
        };
      }

      memberTotals[memberId].total_hours += Number(tc.total_hours || 0);
      memberTotals[memberId].regular_hours += Number(tc.total_hours || 0) - Number(tc.overtime_hours || 0);
      memberTotals[memberId].overtime_hours += Number(tc.overtime_hours || 0);
      memberTotals[memberId].regular_pay += Number(tc.regular_pay || 0);
      memberTotals[memberId].overtime_pay += Number(tc.overtime_pay || 0);
      memberTotals[memberId].total_pay += Number(tc.total_pay || 0);
      if (tc.job_id) {
        memberTotals[memberId].jobs_worked.add(tc.job_id);
      }
    });

    // Process piecework records
    pieceworkRecords?.forEach((pr) => {
      const memberId = pr.member_id;
      if (!memberTotals[memberId]) {
        memberTotals[memberId] = {
          member_id: memberId,
          total_hours: 0,
          regular_hours: 0,
          overtime_hours: 0,
          regular_pay: 0,
          overtime_pay: 0,
          piecework_pay: 0,
          total_pay: 0,
          jobs_worked: new Set<string>(),
        };
      }

      memberTotals[memberId].piecework_pay += Number(pr.total_pay || 0);
      memberTotals[memberId].total_pay += Number(pr.total_pay || 0);
      if (pr.job_id) {
        memberTotals[memberId].jobs_worked.add(pr.job_id);
      }
    });

    // Create payroll items
    const payrollItems = Object.values(memberTotals).map((totals: any) => ({
      payroll_id: payrollRun.id,
      member_id: totals.member_id,
      total_hours: totals.total_hours,
      regular_hours: totals.regular_hours,
      overtime_hours: totals.overtime_hours,
      regular_pay: totals.regular_pay,
      overtime_pay: totals.overtime_pay,
      piecework_pay: totals.piecework_pay,
      total_pay: totals.total_pay,
      jobs_worked: Array.from(totals.jobs_worked),
      status: "calculated",
    }));

    const { error: itemsError } = await supabase
      .from("payroll_items")
      .insert(payrollItems);

    if (itemsError) {
      return NextResponse.json(
        { error: "Failed to create payroll items", details: itemsError.message },
        { status: 500 }
      );
    }

    // Calculate totals
    const totalLaborCost = payrollItems.reduce((sum, item) => sum + Number(item.total_pay), 0);
    const totalHours = payrollItems.reduce((sum, item) => sum + Number(item.total_hours), 0);
    const totalOvertimeHours = payrollItems.reduce((sum, item) => sum + Number(item.overtime_hours), 0);
    const totalPieceworkPay = payrollItems.reduce((sum, item) => sum + Number(item.piecework_pay), 0);

    // Update payroll run with totals
    const { data: updatedRun, error: updateError } = await supabase
      .from("payroll_runs")
      .update({
        total_labor_cost: totalLaborCost,
        total_hours: totalHours,
        total_overtime_hours: totalOvertimeHours,
        total_piecework_pay: totalPieceworkPay,
        total_members: payrollItems.length,
        status: "processed",
      })
      .eq("id", payrollRun.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update payroll run", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payroll_run: updatedRun,
      payroll_items: payrollItems,
      message: "Payroll run created successfully",
    });
  } catch (error: any) {
    console.error("Error in payroll run API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































