// GET /api/workforce/subcontractors/work-orders/[id]/photos - List photos
// POST /api/workforce/subcontractors/work-orders/[id]/photos - Upload photo

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

    // Verify work order belongs to company
    const { data: workOrder } = await supabase
      .from("sub_work_orders")
      .select(`
        id,
        subcontractors!inner(company_id)
      `)
      .eq("id", id)
      .eq("subcontractors.company_id", companyId)
      .single();

    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      );
    }

    // Get photos
    const { data: photos, error } = await supabase
      .from("sub_wo_photos")
      .select("*")
      .eq("work_order_id", id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Error fetching photos:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ photos: photos || [] });
  } catch (error: any) {
    console.error("Error in GET photos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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
    const { photo_url, photo_type, ai_qc_score, ai_flags, ai_analysis } = body;

    // Verify work order belongs to company
    const { data: workOrder } = await supabase
      .from("sub_work_orders")
      .select(`
        id,
        subcontractors!inner(company_id)
      `)
      .eq("id", id)
      .eq("subcontractors.company_id", companyId)
      .single();

    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      );
    }

    // Create photo record
    const { data: photo, error } = await supabase
      .from("sub_wo_photos")
      .insert({
        work_order_id: id,
        photo_url,
        photo_type,
        ai_qc_score,
        ai_flags: ai_flags || [],
        ai_analysis,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating photo:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update photo count on work order
    const { count } = await supabase
      .from("sub_wo_photos")
      .select("*", { count: "exact", head: true })
      .eq("work_order_id", id);

    await supabase
      .from("sub_work_orders")
      .update({ photos_submitted_count: count || 0 })
      .eq("id", id);

    return NextResponse.json({ photo }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST photo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























