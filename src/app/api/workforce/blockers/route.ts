// GET /api/workforce/blockers?milestone_id=xxx - Get blockers for a milestone
// POST /api/workforce/blockers - Create a blocker

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    const milestoneId = searchParams.get("milestone_id");
    const jobId = searchParams.get("job_id");
    const unresolvedOnly = searchParams.get("unresolved_only") === "true";

    let query = supabase
      .from("milestone_blockers")
      .select(`
        *,
        milestone:production_milestones!inner(
          id,
          name,
          job_id,
          jobs!inner(company_id)
        ),
        created_by_employee:workforce_employees!created_by(id, first_name, last_name),
        resolved_by_employee:workforce_employees!resolved_by(id, first_name, last_name)
      `);

    if (milestoneId) {
      query = query.eq("milestone_id", milestoneId);
    }

    if (jobId) {
      query = query.eq("milestone.job_id", jobId);
    }

    if (unresolvedOnly) {
      query = query.eq("resolved", false);
    }

    // Filter by company
    query = query.eq("milestone.jobs.company_id", companyId);

    const { data: blockers, error: blockersError } = await query.order("created_at", { ascending: false });

    if (blockersError) {
      console.error("Error fetching blockers:", blockersError);
      return NextResponse.json(
        { error: blockersError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ blockers: blockers || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/blockers:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

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
    const { milestone_id, description, blocker_type, created_by } = body;

    if (!milestone_id || !description) {
      return NextResponse.json(
        { error: "milestone_id and description are required" },
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

    // Get employee ID if provided, otherwise try to find by user
    let employeeId = created_by;
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

    // Create blocker
    const { data: blocker, error: createError } = await supabase
      .from("milestone_blockers")
      .insert({
        milestone_id,
        description,
        blocker_type: blocker_type || 'other',
        created_by: employeeId,
        resolved: false,
      })
      .select("*")
      .single();

    if (createError) {
      console.error("Error creating blocker:", createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ blocker }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/blockers:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























