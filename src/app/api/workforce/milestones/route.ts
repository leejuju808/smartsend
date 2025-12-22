// GET /api/workforce/milestones?job_id=xxx - Get milestones for a job
// POST /api/workforce/milestones - Create a custom milestone

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
    const jobId = searchParams.get("job_id");

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id parameter is required" },
        { status: 400 }
      );
    }

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job || job.company_id !== companyId) {
      return NextResponse.json(
        { error: "Job not found or access denied" },
        { status: 404 }
      );
    }

    // Get milestones with dependency info
    const { data: milestones, error: milestonesError } = await supabase
      .from("production_milestones")
      .select(`
        *,
        depends_on_milestone:production_milestones!depends_on(id, name, status),
        blockers:milestone_blockers!milestone_id(id, description, blocker_type, resolved, created_at)
      `)
      .eq("job_id", jobId)
      .order("order_index", { ascending: true });

    if (milestonesError) {
      console.error("Error fetching milestones:", milestonesError);
      return NextResponse.json(
        { error: milestonesError.message },
        { status: 500 }
      );
    }

    // Get unresolved blockers count
    const { data: blockers } = await supabase
      .from("milestone_blockers")
      .select("milestone_id")
      .in("milestone_id", milestones?.map(m => m.id) || [])
      .eq("resolved", false);

    const blockersByMilestone = (blockers || []).reduce((acc: any, b) => {
      acc[b.milestone_id] = (acc[b.milestone_id] || 0) + 1;
      return acc;
    }, {});

    // Add blocker counts to milestones
    const milestonesWithBlockers = (milestones || []).map((m: any) => ({
      ...m,
      blocker_count: blockersByMilestone[m.id] || 0,
    }));

    return NextResponse.json({ milestones: milestonesWithBlockers });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/milestones:", error);
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
    const { job_id, name, description, scheduled_date, due_date, depends_on, order_index } = body;

    if (!job_id || !name) {
      return NextResponse.json(
        { error: "job_id and name are required" },
        { status: 400 }
      );
    }

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job || job.company_id !== companyId) {
      return NextResponse.json(
        { error: "Job not found or access denied" },
        { status: 404 }
      );
    }

    // Create milestone
    const { data: milestone, error: createError } = await supabase
      .from("production_milestones")
      .insert({
        job_id,
        name,
        description: description || null,
        scheduled_date: scheduled_date || null,
        due_date: due_date || null,
        depends_on: depends_on || null,
        order_index: order_index ?? null,
        status: 'pending',
      })
      .select("*")
      .single();

    if (createError) {
      console.error("Error creating milestone:", createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ milestone }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/milestones:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























