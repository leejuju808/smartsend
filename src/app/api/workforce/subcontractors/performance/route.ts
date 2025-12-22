// GET /api/workforce/subcontractors/performance - List performance scores
// POST /api/workforce/subcontractors/performance - Create performance score

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
    const subcontractorId = searchParams.get("subcontractor_id");
    const jobId = searchParams.get("job_id");
    const workOrderId = searchParams.get("work_order_id");

    let query = supabase
      .from("sub_performance_scores")
      .select(`
        *,
        subcontractors!inner(id, name, company_id),
        jobs(id, title),
        sub_work_orders(id, description)
      `)
      .eq("subcontractors.company_id", companyId)
      .order("created_at", { ascending: false });

    if (subcontractorId) {
      query = query.eq("subcontractor_id", subcontractorId);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (workOrderId) {
      query = query.eq("work_order_id", workOrderId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching performance scores:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ performance_scores: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subcontractors/performance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const {
      subcontractor_id,
      job_id,
      work_order_id,
      qc_score,
      on_time_score,
      professionalism_score,
      cleanup_score,
      safety_score,
      notes,
    } = body;

    // Verify subcontractor belongs to company
    const { data: sub, error: subError } = await supabase
      .from("subcontractors")
      .select("id, company_id")
      .eq("id", subcontractor_id)
      .eq("company_id", companyId)
      .single();

    if (subError || !sub) {
      return NextResponse.json(
        { error: "Subcontractor not found or access denied" },
        { status: 404 }
      );
    }

    // Create performance score (trigger will calculate overall_score)
    const { data: score, error: scoreError } = await supabase
      .from("sub_performance_scores")
      .insert({
        subcontractor_id,
        job_id,
        work_order_id,
        qc_score,
        on_time_score,
        professionalism_score,
        cleanup_score,
        safety_score,
        notes,
        created_by: user.id,
      })
      .select()
      .single();

    if (scoreError) {
      console.error("Error creating performance score:", scoreError);
      return NextResponse.json({ error: scoreError.message }, { status: 500 });
    }

    return NextResponse.json({ performance_score: score }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/subcontractors/performance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























