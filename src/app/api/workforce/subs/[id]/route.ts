// GET /api/workforce/subs/[id] - Get subcontractor with details
// PATCH /api/workforce/subs/[id] - Update subcontractor
// DELETE /api/workforce/subs/[id] - Delete subcontractor

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
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

    // Get subcontractor with all related data
    const { data: sub, error: subError } = await supabase
      .from("subcontractors")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (subError || !sub) {
      return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });
    }

    // Get documents
    const { data: documents } = await supabase
      .from("subcontractor_documents")
      .select("*")
      .eq("sub_id", id)
      .order("uploaded_at", { ascending: false });

    // Get performance reviews
    const { data: reviews } = await supabase
      .from("sub_performance_reviews")
      .select("*")
      .eq("sub_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Calculate average rating
    let avgRating = 0;
    if (reviews && reviews.length > 0) {
      const total = reviews.reduce((sum, r) => {
        return sum + (r.rating_speed + r.rating_quality + r.rating_professionalism) / 3;
      }, 0);
      avgRating = total / reviews.length;
    }

    // Get job assignments
    const { data: assignments } = await supabase
      .from("sub_job_assignments")
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address,
          stage
        )
      `)
      .eq("sub_id", id)
      .order("assigned_at", { ascending: false })
      .limit(20);

    // Get pay sheets
    const { data: paySheets } = await supabase
      .from("sub_pay_sheets")
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address
        )
      `)
      .eq("sub_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Get stats
    const { data: completedJobs } = await supabase
      .from("sub_job_assignments")
      .select("id", { count: "exact", head: true })
      .eq("sub_id", id)
      .eq("status", "completed");

    const { data: totalPaySheets } = await supabase
      .from("sub_pay_sheets")
      .select("total_pay")
      .eq("sub_id", id);

    const totalPaid = totalPaySheets?.reduce((sum, ps) => sum + (parseFloat(ps.total_pay.toString()) || 0), 0) || 0;

    return NextResponse.json({
      subcontractor: sub,
      documents: documents || [],
      reviews: reviews || [],
      assignments: assignments || [],
      pay_sheets: paySheets || [],
      stats: {
        avg_rating: Math.round(avgRating * 10) / 10,
        jobs_completed: completedJobs?.length || 0,
        total_paid: totalPaid,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subs/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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

    // Verify subcontractor belongs to company
    const { data: existing } = await supabase
      .from("subcontractors")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("subcontractors")
      .update({
        name: body.name,
        contact_name: body.contact_name,
        phone: body.phone,
        email: body.email,
        trade: body.trade,
        status: body.status,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating subcontractor:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ subcontractor: data });
  } catch (error: any) {
    console.error("Error in PATCH /api/workforce/subs/[id]:", error);
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

    // Verify subcontractor belongs to company
    const { data: existing } = await supabase
      .from("subcontractors")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });
    }

    const { error } = await supabase.from("subcontractors").delete().eq("id", id);

    if (error) {
      console.error("Error deleting subcontractor:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/workforce/subs/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























