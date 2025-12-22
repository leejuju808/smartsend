// POST /api/workforce/blockers/[id]/resolve - Resolve a blocker

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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;
    const body = await req.json();
    const { resolution_notes, resolved_by } = body;

    // Verify blocker belongs to a milestone in a job in this company
    const { data: blocker, error: blockerError } = await supabase
      .from("milestone_blockers")
      .select(`
        *,
        milestone:production_milestones!inner(
          id,
          job_id,
          jobs!inner(company_id)
        )
      `)
      .eq("id", id)
      .single();

    if (blockerError || !blocker) {
      return NextResponse.json({ error: "Blocker not found" }, { status: 404 });
    }

    if (blocker.milestone.jobs.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this blocker" },
        { status: 403 }
      );
    }

    // Get employee ID if provided
    let employeeId = resolved_by;
    if (!employeeId) {
      const { data: employee } = await supabase
        .from("workforce_employees")
        .select("id")
        .eq("company_id", companyId)
        .or(`email.eq.${user.email},user_id.eq.${user.id}`)
        .limit(1)
        .maybeSingle();
      
      employeeId = employee?.id || null;
    }

    // Resolve blocker
    const { data: updatedBlocker, error: updateError } = await supabase
      .from("milestone_blockers")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: employeeId,
        resolution_notes: resolution_notes || null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Error resolving blocker:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ blocker: updatedBlocker });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/blockers/[id]/resolve:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























