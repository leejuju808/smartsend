// POST /api/workforce/milestones/reschedule - Reschedule milestone and shift dependencies

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
    const { milestone_id, new_scheduled_date, new_due_date } = body;

    if (!milestone_id || !new_scheduled_date || !new_due_date) {
      return NextResponse.json(
        { error: "milestone_id, new_scheduled_date, and new_due_date are required" },
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
      .eq("id", milestone_id)
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

    // Call the reschedule function
    const { error: rescheduleError } = await supabase.rpc('reschedule_milestone', {
      p_milestone_id: milestone_id,
      p_new_scheduled_date: new_scheduled_date,
      p_new_due_date: new_due_date,
    });

    if (rescheduleError) {
      console.error("Error rescheduling milestone:", rescheduleError);
      return NextResponse.json(
        { error: rescheduleError.message },
        { status: 500 }
      );
    }

    // Get updated milestone and dependents
    const { data: updatedMilestone } = await supabase
      .from("production_milestones")
      .select("*")
      .eq("id", milestone_id)
      .single();

    const { data: dependentMilestones } = await supabase
      .from("production_milestones")
      .select("*")
      .eq("depends_on", milestone_id)
      .order("order_index", { ascending: true });

    return NextResponse.json({
      success: true,
      milestone: updatedMilestone,
      shifted_dependents: dependentMilestones || [],
    });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/milestones/reschedule:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























