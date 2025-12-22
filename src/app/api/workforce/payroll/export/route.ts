// GET /api/workforce/payroll/export - Export payroll to QuickBooks CSV

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

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
    const periodId = searchParams.get("period_id");
    const weekStart = searchParams.get("week_start");

    if (!periodId && !weekStart) {
      return NextResponse.json(
        { error: "period_id or week_start is required" },
        { status: 400 }
      );
    }

    let period: any;

    if (periodId) {
      const { data: periodData, error: periodError } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("id", periodId)
        .eq("company_id", companyId)
        .single();

      if (periodError || !periodData) {
        return NextResponse.json(
          { error: "Payroll period not found" },
          { status: 404 }
        );
      }

      period = periodData;
    } else {
      // Get period by week_start
      const { data: periodData, error: periodError } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("company_id", companyId)
        .eq("week_start", weekStart)
        .maybeSingle();

      if (periodError) {
        return NextResponse.json({ error: periodError.message }, { status: 500 });
      }

      if (!periodData) {
        return NextResponse.json(
          { error: "Payroll period not found" },
          { status: 404 }
        );
      }

      period = periodData;
    }

    // Get payroll entries
    const { data: entries, error: entriesError } = await supabase
      .from("payroll_entries")
      .select(`
        *,
        employee:workforce_employees(id, first_name, last_name)
      `)
      .eq("period_id", period.id)
      .order("employee.first_name");

    if (entriesError) {
      return NextResponse.json({ error: entriesError.message }, { status: 500 });
    }

    // If no entries, try to get from weekly summary
    if (!entries || entries.length === 0) {
      // Get weekly summary
      const { data: summaryData } = await supabase
        .from("payroll_weekly_summary")
        .select(`
          *,
          employee:workforce_employees!inner(id, first_name, last_name, role),
          pay_rate:role_pay_rates!inner(hourly_rate, overtime_multiplier)
        `)
        .eq("company_id", companyId)
        .eq("week_start", period.week_start);

      // Build CSV from summary
      const csvRows = [
        "Employee,Date,Regular Hours,Overtime Hours,Pay Rate,Gross Pay",
      ];

      summaryData?.forEach((summary: any) => {
        const employeeName = `${summary.employee.first_name} ${summary.employee.last_name}`;
        const payRate = summary.pay_rate?.hourly_rate || 0;
        const regularPay = summary.regular_hours * payRate;
        const overtimePay =
          summary.overtime_hours * payRate * (summary.pay_rate?.overtime_multiplier || 1.5);
        const grossPay = regularPay + overtimePay;

        csvRows.push(
          `"${employeeName}","${period.week_start}",${summary.regular_hours},${summary.overtime_hours},${payRate},${grossPay.toFixed(2)}`
        );
      });

      const csv = csvRows.join("\n");

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="payroll_${period.week_start}.csv"`,
        },
      });
    }

    // Build CSV from finalized entries
    const csvRows = [
      "Employee,Date,Regular Hours,Overtime Hours,Pay Rate,Gross Pay",
    ];

    entries.forEach((entry: any) => {
      const employeeName = `${entry.employee.first_name} ${entry.employee.last_name}`;
      const payRate =
        entry.total_pay /
        (entry.regular_hours + entry.overtime_hours * 1.5); // Approximate rate
      const grossPay = entry.total_pay;

      csvRows.push(
        `"${employeeName}","${period.week_start}",${entry.regular_hours},${entry.overtime_hours},${payRate.toFixed(2)},${grossPay.toFixed(2)}`
      );
    });

    const csv = csvRows.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="payroll_${period.week_start}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/payroll/export:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























