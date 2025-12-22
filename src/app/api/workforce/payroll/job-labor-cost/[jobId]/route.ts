// Block 253700 — Crew Payroll Engine v1
// GET /api/workforce/payroll/job-labor-cost/[jobId] - Get job labor cost summary

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;
    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    // Get job labor cost summary
    const { data: summary, error } = await supabase.rpc("get_job_labor_cost_summary", {
      p_job_id: jobId,
    });

    if (error) {
      console.error("Error fetching job labor cost summary:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate totals
    const totals = {
      total_employees: summary?.length || 0,
      total_hours: summary?.reduce((sum: number, row: any) => sum + (row.total_hours || 0), 0) || 0,
      total_regular_hours: summary?.reduce((sum: number, row: any) => sum + (row.regular_hours || 0), 0) || 0,
      total_overtime_hours: summary?.reduce((sum: number, row: any) => sum + (row.overtime_hours || 0), 0) || 0,
      total_pay: summary?.reduce((sum: number, row: any) => sum + (row.total_pay || 0), 0) || 0,
      prevailing_wage_applied: summary?.some((row: any) => row.prevailing_wage_applied) || false,
    };

    return NextResponse.json({
      summary: summary || [],
      totals,
      job_id: jobId,
    });
  } catch (error: any) {
    console.error("Error in job labor cost GET API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























