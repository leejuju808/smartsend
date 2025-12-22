// POST /api/workforce/payroll/finalize - Finalize payroll period

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

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
    const { period_id } = body;

    if (!period_id) {
      return NextResponse.json({ error: "period_id is required" }, { status: 400 });
    }

    // Verify period belongs to company
    const { data: period, error: periodError } = await supabase
      .from("payroll_periods")
      .select("*")
      .eq("id", period_id)
      .eq("company_id", companyId)
      .single();

    if (periodError || !period) {
      return NextResponse.json(
        { error: "Payroll period not found" },
        { status: 404 }
      );
    }

    if (period.status === "locked") {
      return NextResponse.json(
        { error: "Payroll period is already locked" },
        { status: 400 }
      );
    }

    // Call the finalize_payroll RPC function
    const { error: finalizeError } = await supabase.rpc("finalize_payroll", {
      p_period_id: period_id,
    });

    if (finalizeError) {
      console.error("Error finalizing payroll:", finalizeError);
      return NextResponse.json({ error: finalizeError.message }, { status: 500 });
    }

    // Get updated period and entries
    const { data: updatedPeriod } = await supabase
      .from("payroll_periods")
      .select("*")
      .eq("id", period_id)
      .single();

    const { data: entries } = await supabase
      .from("payroll_entries")
      .select(`
        *,
        employee:workforce_employees(id, first_name, last_name)
      `)
      .eq("period_id", period_id);

    return NextResponse.json({
      period: updatedPeriod,
      entries: entries || [],
      message: "Payroll finalized successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/payroll/finalize:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























