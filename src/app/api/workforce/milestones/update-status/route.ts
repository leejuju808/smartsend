// POST /api/workforce/milestones/update-status - Update milestone status with dependency validation

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
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "Milestone ID and status are required" },
        { status: 400 }
      );
    }

    // Validate status
    if (!['pending', 'in_progress', 'completed', 'delayed'].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: pending, in_progress, completed, or delayed" },
        { status: 400 }
      );
    }

    // Verify milestone belongs to a job in this company
    const { data: milestone, error: milestoneError } = await supabase
      .from("production_milestones")
      .select(`
        *,
        jobs!inner(company_id)
      `)
      .eq("id", id)
      .single();

    if (milestoneError || !milestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    if (milestone.jobs.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this milestone" },
        { status: 403 }
      );
    }

    // Validate dependencies if trying to complete
    if (status === 'completed') {
      const { data: canComplete, error: depError } = await supabase.rpc(
        'can_complete_milestone',
        { p_milestone_id: id }
      );

      if (depError) {
        console.error("Error checking dependencies:", depError);
        return NextResponse.json(
          { error: "Failed to validate dependencies" },
          { status: 500 }
        );
      }

      if (!canComplete) {
        return NextResponse.json(
          { 
            error: "Cannot complete milestone. Dependency milestone must be completed first.",
            requires_dependency: true
          },
          { status: 400 }
        );
      }
    }

    // Build update fields
    const updateFields: any = { status };

    if (status === 'completed') {
      updateFields.completed_date = new Date().toISOString().split('T')[0];
    }
    
    if (status === 'in_progress') {
      updateFields.started_date = new Date().toISOString().split('T')[0];
    }

    // Update milestone
    const { data: updatedMilestone, error: updateError } = await supabase
      .from("production_milestones")
      .update(updateFields)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Error updating milestone:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      milestone: updatedMilestone 
    });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/milestones/update-status:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























