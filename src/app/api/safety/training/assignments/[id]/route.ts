// PATCH /api/safety/training/assignments/[id] - Update assignment status
// DELETE /api/safety/training/assignments/[id] - Delete assignment

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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;
    const body = await req.json();
    const { status, notes } = body;

    // Verify assignment belongs to company
    const { data: assignment } = await supabase
      .from("safety_training_assignments")
      .select(`
        *,
        employee:workforce_employees!inner(company_id)
      `)
      .eq("id", id)
      .eq("employee.company_id", companyId)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const updateData: any = {};

    if (status) {
      updateData.status = status;
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
      if (status === "in_progress" && !assignment.started_at) {
        // Note: We don't have started_at in assignments, but we can track it via status
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const { data: updated, error } = await supabase
      .from("safety_training_assignments")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: updated });
  } catch (error: any) {
    console.error("Error in PATCH /api/safety/training/assignments/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;

    // Verify assignment belongs to company
    const { data: assignment } = await supabase
      .from("safety_training_assignments")
      .select(`
        *,
        employee:workforce_employees!inner(company_id)
      `)
      .eq("id", id)
      .eq("employee.company_id", companyId)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("safety_training_assignments")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/safety/training/assignments/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























