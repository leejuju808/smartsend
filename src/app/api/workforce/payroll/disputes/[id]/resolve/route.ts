// Block 253700 — Crew Payroll Engine v1
// POST /api/workforce/payroll/disputes/[id]/resolve - Resolve dispute

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const body = await req.json();
    const { status, resolution_notes, hours_adjustment, amount_adjustment } = body;

    if (!status || !["approved", "rejected", "resolved"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'approved', 'rejected', or 'resolved'" },
        { status: 400 }
      );
    }

    // Verify dispute belongs to company
    const { data: dispute, error: fetchError } = await supabase
      .from("payroll_disputes")
      .select("id, company_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (fetchError || !dispute) {
      return NextResponse.json(
        { error: "Dispute not found" },
        { status: 404 }
      );
    }

    // Resolve dispute
    const { error: resolveError } = await supabase.rpc("resolve_payroll_dispute", {
      p_dispute_id: id,
      p_resolved_by: user.id,
      p_status: status,
      p_resolution_notes: resolution_notes || null,
      p_hours_adjustment: hours_adjustment || 0,
      p_amount_adjustment: amount_adjustment || 0,
    });

    if (resolveError) {
      console.error("Error resolving dispute:", resolveError);
      return NextResponse.json({ error: resolveError.message }, { status: 500 });
    }

    // Get updated dispute
    const { data: updatedDispute, error: fetchUpdatedError } = await supabase
      .from("payroll_disputes")
      .select(`
        *,
        timecard:employee_timecards(id, clock_in, clock_out, total_hours),
        employee:workforce_employees(id, first_name, last_name)
      `)
      .eq("id", id)
      .single();

    if (fetchUpdatedError) {
      console.error("Error fetching updated dispute:", fetchUpdatedError);
    }

    return NextResponse.json({ dispute: updatedDispute });
  } catch (error: any) {
    console.error("Error in dispute resolve API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























