// Block 25500 — SmartSend Roofing Payroll & Crew Pay v1
// API Route: Update Crew Pay Entry
// PATCH /api/crew/pay/[id]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    // Ensure user is authenticated
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
    const { status, approved_by, notes, payment_reference } = body;

    // Get pay entry to verify access
    const { data: payEntry, error: payEntryError } = await supabase
      .from("crew_pay_entries")
      .select("workspace_id")
      .eq("id", id)
      .single();

    if (payEntryError || !payEntry) {
      return NextResponse.json(
        { error: "Pay entry not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", payEntry.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === "approved" || status === "paid") {
        updateData.approved_by = user.id;
        updateData.approved_at = new Date().toISOString();
      }
      if (status === "paid") {
        updateData.paid_at = new Date().toISOString();
      }
    }
    if (notes !== undefined) updateData.notes = notes;
    if (payment_reference !== undefined) updateData.payment_reference = payment_reference;

    // Update pay entry
    const { data: updatedPayEntry, error: updateError } = await supabase
      .from("crew_pay_entries")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        job:roofing_jobs(id, title, job_value),
        crew:crews(id, name),
        bonuses:crew_bonuses(*),
        penalties:crew_penalties(*)
      `)
      .single();

    if (updateError) {
      console.error("Error updating pay entry:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update pay entry" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { pay_entry: updatedPayEntry },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in crew pay PATCH API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































