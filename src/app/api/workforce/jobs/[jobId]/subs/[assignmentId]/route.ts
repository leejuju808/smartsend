// PATCH /api/workforce/jobs/[jobId]/subs/[assignmentId] - Update assignment
// DELETE /api/workforce/jobs/[jobId]/subs/[assignmentId] - Remove assignment

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; assignmentId: string }> }
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

    const { assignmentId } = await params;
    const body = await req.json();

    // Verify assignment exists and sub belongs to company
    const { data: assignment } = await supabase
      .from("sub_job_assignments")
      .select(`
        *,
        subcontractors:sub_id (
          company_id
        )
      `)
      .eq("id", assignmentId)
      .single();

    if (!assignment || assignment.subcontractors?.company_id !== companyId) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status === "completed" && !assignment.completed_at) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("sub_job_assignments")
      .update(updateData)
      .eq("id", assignmentId)
      .select(`
        *,
        subcontractors:sub_id (
          id,
          name,
          contact_name,
          phone,
          email,
          trade
        )
      `)
      .single();

    if (error) {
      console.error("Error updating assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: data });
  } catch (error: any) {
    console.error("Error in PATCH /api/workforce/jobs/[jobId]/subs/[assignmentId]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; assignmentId: string }> }
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

    const { assignmentId } = await params;

    // Verify assignment exists and sub belongs to company
    const { data: assignment } = await supabase
      .from("sub_job_assignments")
      .select(`
        *,
        subcontractors:sub_id (
          company_id
        )
      `)
      .eq("id", assignmentId)
      .single();

    if (!assignment || assignment.subcontractors?.company_id !== companyId) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const { error } = await supabase.from("sub_job_assignments").delete().eq("id", assignmentId);

    if (error) {
      console.error("Error deleting assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/workforce/jobs/[jobId]/subs/[assignmentId]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























