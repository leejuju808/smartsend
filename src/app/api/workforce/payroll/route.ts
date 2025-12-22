// GET /api/workforce/payroll - Get payroll dashboard data
// POST /api/workforce/payroll - Create payroll period

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";
import type { PayrollEmployeeSummary, PayrollDiscrepancy } from "@/types/database";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const weekStart = searchParams.get("week_start");
    
    // Default to current week if not specified
    const currentDate = weekStart ? new Date(weekStart) : new Date();
    const weekStartDate = new Date(currentDate);
    weekStartDate.setDate(currentDate.getDate() - currentDate.getDay()); // Sunday
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6); // Saturday

    const weekStartStr = weekStartDate.toISOString().split("T")[0];
    const weekEndStr = weekEndDate.toISOString().split("T")[0];

    // Get or create payroll period
    let { data: period } = await supabase
      .from("payroll_periods")
      .select("*")
      .eq("company_id", companyId)
      .eq("week_start", weekStartStr)
      .maybeSingle();

    if (!period) {
      // Create period if it doesn't exist
      const { data: newPeriod, error: createError } = await supabase
        .from("payroll_periods")
        .insert({
          company_id: companyId,
          week_start: weekStartStr,
          week_end: weekEndStr,
          status: "open",
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating payroll period:", createError);
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      period = newPeriod;
    }

    // Get weekly summary for all employees
    const { data: weeklySummary, error: summaryError } = await supabase
      .rpc("get_payroll_weekly_summary", {
        p_company_id: companyId,
        p_week_start: weekStartStr,
      });

    // Fallback: query the view directly
    const { data: summaryData } = await supabase
      .from("payroll_weekly_summary")
      .select("*")
      .eq("company_id", companyId)
      .eq("week_start", weekStartStr);

    // Get employees with their pay rates
    const { data: employees } = await supabase
      .from("workforce_employees")
      .select("id, first_name, last_name, role")
      .eq("company_id", companyId)
      .eq("status", "active");

    // Get pay rates
    const { data: payRates } = await supabase
      .from("role_pay_rates")
      .select("*")
      .eq("company_id", companyId);

    // Build employee summaries
    const employeeSummaries: PayrollEmployeeSummary[] = (employees || []).map((emp) => {
      const summary = summaryData?.find((s) => s.employee_id === emp.id);
      const payRate = payRates?.find((r) => r.role === emp.role);

      const regularHours = summary?.regular_hours || 0;
      const overtimeHours = summary?.overtime_hours || 0;
      const totalHours = summary?.total_hours || 0;
      const hourlyRate = payRate?.hourly_rate || 0;
      const overtimeMultiplier = payRate?.overtime_multiplier || 1.5;

      const totalPay =
        regularHours * hourlyRate + overtimeHours * hourlyRate * overtimeMultiplier;

      return {
        employee_id: emp.id,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        role: emp.role,
        total_hours: totalHours,
        regular_hours: regularHours,
        overtime_hours: overtimeHours,
        total_pay: totalPay,
        status: period?.status === "locked" ? "finalized" : "pending",
        discrepancies: [], // Will be populated below
      };
    });

    // Get discrepancies
    const discrepancies: PayrollDiscrepancy[] = [];

    // Missing clock-outs
    const { data: missingClockOuts } = await supabase
      .from("crew_time_clock")
      .select(`
        *,
        employee:workforce_employees!inner(id, first_name, last_name, company_id),
        job:jobs(id, notes)
      `)
      .eq("employee.company_id", companyId)
      .is("clock_out", null)
      .gte("clock_in", weekStartDate.toISOString())
      .lte("clock_in", weekEndDate.toISOString());

    missingClockOuts?.forEach((record: any) => {
      discrepancies.push({
        type: "missing_clock_out",
        employee_id: record.employee_id,
        employee_name: `${record.employee.first_name} ${record.employee.last_name}`,
        job_id: record.job_id,
        job_address: record.job?.notes || "",
        clock_in: record.clock_in,
        details: "Employee clocked in but never clocked out",
      });
    });

    // Over 14-hour workdays
    const { data: longDays } = await supabase
      .from("crew_time_clock")
      .select(`
        *,
        employee:workforce_employees!inner(id, first_name, last_name, company_id),
        job:jobs(id, notes)
      `)
      .eq("employee.company_id", companyId)
      .not("clock_out", "is", null)
      .not("duration_minutes", "is", null)
      .gt("duration_minutes", 14 * 60)
      .gte("clock_in", weekStartDate.toISOString())
      .lte("clock_in", weekEndDate.toISOString());

    longDays?.forEach((record: any) => {
      discrepancies.push({
        type: "over_14_hours",
        employee_id: record.employee_id,
        employee_name: `${record.employee.first_name} ${record.employee.last_name}`,
        job_id: record.job_id,
        job_address: record.job?.notes || "",
        clock_in: record.clock_in,
        clock_out: record.clock_out,
        duration_minutes: record.duration_minutes,
        details: `Worked ${(record.duration_minutes / 60).toFixed(1)} hours in a single day`,
      });
    });

    // Multiple same-day clock-ins
    const { data: multipleClockIns } = await supabase
      .rpc("get_multiple_clock_ins", {
        p_company_id: companyId,
        p_week_start: weekStartStr,
        p_week_end: weekEndStr,
      });

    multipleClockIns?.forEach((record: any) => {
      discrepancies.push({
        type: "multiple_clock_ins",
        employee_id: record.employee_id,
        employee_name: record.employee_name,
        job_id: "", // Not available from this query
        details: `${record.clock_count} clock-ins on ${new Date(record.clock_date).toLocaleDateString()}`,
      });
    });

    // Add discrepancies to employee summaries
    employeeSummaries.forEach((summary) => {
      summary.discrepancies = discrepancies.filter(
        (d) => d.employee_id === summary.employee_id
      );
    });

    // Get finalized entries if period is locked
    let finalizedEntries: any[] = [];
    if (period?.status === "locked") {
      const { data: entries } = await supabase
        .from("payroll_entries")
        .select(`
          *,
          employee:workforce_employees(id, first_name, last_name)
        `)
        .eq("period_id", period.id);

      finalizedEntries = entries || [];
    }

    return NextResponse.json({
      period,
      employee_summaries: employeeSummaries,
      discrepancies,
      finalized_entries: finalizedEntries,
      total_hours: employeeSummaries.reduce((sum, e) => sum + e.total_hours, 0),
      total_pay: employeeSummaries.reduce((sum, e) => sum + e.total_pay, 0),
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/payroll:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const body = await req.json();
    const { week_start, week_end, notes } = body;

    if (!week_start || !week_end) {
      return NextResponse.json(
        { error: "week_start and week_end are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("payroll_periods")
      .insert({
        company_id: companyId,
        week_start: week_start,
        week_end: week_end,
        status: "open",
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating payroll period:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ period: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/payroll:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























