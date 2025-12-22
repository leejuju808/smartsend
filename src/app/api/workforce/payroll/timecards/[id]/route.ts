// Block 253700 — Crew Payroll Engine v1
// PATCH /api/workforce/payroll/timecards/[id] - Update timecard
// DELETE /api/workforce/payroll/timecards/[id] - Delete timecard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function PATCH(
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
    const {
      clock_out,
      clock_out_lat,
      clock_out_lng,
      pay_type,
      notes,
      status,
    } = body;

    // Verify timecard belongs to company
    const { data: timecard, error: fetchError } = await supabase
      .from("employee_timecards")
      .select("id, company_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (fetchError || !timecard) {
      return NextResponse.json(
        { error: "Timecard not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updates: any = {};
    if (clock_out !== undefined) updates.clock_out = clock_out;
    if (clock_out_lat !== undefined) updates.clock_out_lat = clock_out_lat;
    if (clock_out_lng !== undefined) updates.clock_out_lng = clock_out_lng;
    if (pay_type !== undefined) updates.pay_type = pay_type;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) updates.status = status;

    // Update timecard
    const { data: updatedTimecard, error: updateError } = await supabase
      .from("employee_timecards")
      .update(updates)
      .eq("id", id)
      .select(`
        *,
        employee:workforce_employees(id, first_name, last_name, role),
        job:jobs(id, address, homeowner_name)
      `)
      .single();

    if (updateError) {
      console.error("Error updating timecard:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ timecard: updatedTimecard });
  } catch (error: any) {
    console.error("Error in timecard PATCH API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Verify timecard belongs to company
    const { data: timecard, error: fetchError } = await supabase
      .from("employee_timecards")
      .select("id, company_id, status")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (fetchError || !timecard) {
      return NextResponse.json(
        { error: "Timecard not found" },
        { status: 404 }
      );
    }

    // Don't allow deletion of approved timecards
    if (timecard.status === "approved") {
      return NextResponse.json(
        { error: "Cannot delete approved timecard" },
        { status: 400 }
      );
    }

    // Delete timecard
    const { error: deleteError } = await supabase
      .from("employee_timecards")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting timecard:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in timecard DELETE API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























