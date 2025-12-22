// GET /api/workforce/subcontractors/work-orders/[id] - Get work order
// PATCH /api/workforce/subcontractors/work-orders/[id] - Update work order
// DELETE /api/workforce/subcontractors/work-orders/[id] - Delete work order

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

    // Get work order with related data
    const { data: workOrder, error: woError } = await supabase
      .from("sub_work_orders")
      .select(`
        *,
        subcontractors!inner(id, name, company_id),
        jobs(id, title, address, homeowner_name, homeowner_phone)
      `)
      .eq("id", id)
      .eq("subcontractors.company_id", companyId)
      .single();

    if (woError || !workOrder) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      );
    }

    // Get photos
    const { data: photos } = await supabase
      .from("sub_wo_photos")
      .select("*")
      .eq("work_order_id", id)
      .order("uploaded_at", { ascending: false });

    // Get payments
    const { data: payments } = await supabase
      .from("sub_payments")
      .select("*")
      .eq("work_order_id", id)
      .order("created_at", { ascending: false });

    // Check if photos meet requirements
    const { data: photosMeetRequirements } = await supabase.rpc(
      "check_work_order_photos",
      { p_work_order_id: id }
    );

    return NextResponse.json({
      work_order: workOrder,
      photos: photos || [],
      payments: payments || [],
      photos_meet_requirements: photosMeetRequirements,
    });
  } catch (error: any) {
    console.error("Error in GET work order:", error);
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

    // Verify work order belongs to company
    const { data: existingWO } = await supabase
      .from("sub_work_orders")
      .select(`
        id,
        subcontractors!inner(company_id)
      `)
      .eq("id", id)
      .eq("subcontractors.company_id", companyId)
      .single();

    if (!existingWO) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      );
    }

    // Handle status changes
    const updates: any = { ...body };
    if (body.status === "approved") {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = user.id;
    }
    if (body.status === "completed") {
      updates.completed_at = new Date().toISOString();
    }

    // Recalculate cost if tasks changed
    if (body.tasks) {
      const totalEstimatedCost = body.tasks.reduce((sum: number, task: any) => {
        return sum + (task.quantity || 0) * (task.rate || 0);
      }, 0);
      updates.total_estimated_cost = totalEstimatedCost;
    }

    const { data: workOrder, error } = await supabase
      .from("sub_work_orders")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating work order:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ work_order: workOrder });
  } catch (error: any) {
    console.error("Error in PATCH work order:", error);
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

    // Verify work order belongs to company
    const { data: existingWO } = await supabase
      .from("sub_work_orders")
      .select(`
        id,
        subcontractors!inner(company_id)
      `)
      .eq("id", id)
      .eq("subcontractors.company_id", companyId)
      .single();

    if (!existingWO) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      );
    }

    // Delete work order (cascade will handle related records)
    const { error } = await supabase
      .from("sub_work_orders")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting work order:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE work order:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























