// GET /api/workforce/subcontractors/work-orders - List work orders
// POST /api/workforce/subcontractors/work-orders - Create work order

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
    const subcontractorId = searchParams.get("subcontractor_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("sub_work_orders")
      .select(`
        *,
        subcontractors!inner(id, name, company_id),
        jobs(id, title, address, homeowner_name)
      `)
      .eq("subcontractors.company_id", companyId)
      .order("created_at", { ascending: false });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (subcontractorId) {
      query = query.eq("subcontractor_id", subcontractorId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching work orders:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get photo counts for each work order
    const workOrdersWithPhotos = await Promise.all(
      (data || []).map(async (wo) => {
        const { count } = await supabase
          .from("sub_wo_photos")
          .select("*", { count: "exact", head: true })
          .eq("work_order_id", wo.id);

        return {
          ...wo,
          photos_submitted_count: count || 0,
        };
      })
    );

    return NextResponse.json({ work_orders: workOrdersWithPhotos });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subcontractors/work-orders:", error);
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
      job_id,
      subcontractor_id,
      description,
      scheduled_date,
      tasks,
      photo_requirements,
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

    // Check compliance before assigning
    const { data: complianceStatus } = await supabase.rpc(
      "get_sub_compliance_status_v2",
      { p_subcontractor_id: subcontractor_id }
    );

    if (complianceStatus === "incomplete") {
      return NextResponse.json(
        { error: "Subcontractor compliance documents incomplete or expired" },
        { status: 400 }
      );
    }

    // Calculate estimated cost from tasks
    let totalEstimatedCost = 0;
    if (tasks && Array.isArray(tasks)) {
      totalEstimatedCost = tasks.reduce((sum: number, task: any) => {
        return sum + (task.quantity || 0) * (task.rate || 0);
      }, 0);
    }

    // Calculate required photo count
    let photosRequiredCount = 0;
    if (photo_requirements) {
      photosRequiredCount += photo_requirements.before || 0;
      photosRequiredCount += photo_requirements.during || 0;
      photosRequiredCount += photo_requirements.after || 0;
      if (photo_requirements.flashing_detail) photosRequiredCount += 1;
      if (photo_requirements.ridge_cap_detail) photosRequiredCount += 1;
    }

    // Create work order
    const { data: workOrder, error: woError } = await supabase
      .from("sub_work_orders")
      .insert({
        job_id,
        subcontractor_id,
        description,
        scheduled_date,
        tasks: tasks || [],
        photo_requirements: photo_requirements || {},
        photos_required_count: photosRequiredCount,
        total_estimated_cost: totalEstimatedCost,
        notes,
        created_by: user.id,
      })
      .select()
      .single();

    if (woError) {
      console.error("Error creating work order:", woError);
      return NextResponse.json({ error: woError.message }, { status: 500 });
    }

    return NextResponse.json({ work_order: workOrder }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/subcontractors/work-orders:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























