// Block 253700 — Crew Payroll Engine v1
// GET /api/workforce/payroll/summary - Get payroll summary report

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "start_date and end_date are required" },
        { status: 400 }
      );
    }

    // Generate payroll summary
    const { data: summary, error } = await supabase.rpc("generate_payroll_summary", {
      p_company_id: companyId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      console.error("Error generating payroll summary:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate totals
    const totals = {
      total_employees: summary?.length || 0,
      total_hours: summary?.reduce((sum: number, row: any) => sum + (row.total_hours || 0), 0) || 0,
      total_regular_hours: summary?.reduce((sum: number, row: any) => sum + (row.regular_hours || 0), 0) || 0,
      total_overtime_hours: summary?.reduce((sum: number, row: any) => sum + (row.overtime_hours || 0), 0) || 0,
      total_pay: summary?.reduce((sum: number, row: any) => sum + (row.total_pay || 0), 0) || 0,
      total_prevailing_wage_pay: summary?.reduce((sum: number, row: any) => sum + (row.prevailing_wage_pay || 0), 0) || 0,
    };

    return NextResponse.json({
      summary: summary || [],
      totals,
      period: {
        start_date: startDate,
        end_date: endDate,
      },
    });
  } catch (error: any) {
    console.error("Error in payroll summary GET API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























