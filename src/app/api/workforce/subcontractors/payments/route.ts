// GET /api/workforce/subcontractors/payments - List payments
// POST /api/workforce/subcontractors/payments - Create payment

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
    const workOrderId = searchParams.get("work_order_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("sub_payments")
      .select(`
        *,
        sub_work_orders!inner(
          id,
          subcontractors!inner(company_id)
        )
      `)
      .eq("sub_work_orders.subcontractors.company_id", companyId)
      .order("created_at", { ascending: false });

    if (workOrderId) {
      query = query.eq("work_order_id", workOrderId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching payments:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ payments: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subcontractors/payments:", error);
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
      work_order_id,
      amount,
      payment_method,
      check_number,
      payment_date,
      notes,
    } = body;

    // Verify work order belongs to company
    const { data: workOrder } = await supabase
      .from("sub_work_orders")
      .select(`
        id,
        status,
        subcontractors!inner(company_id)
      `)
      .eq("id", work_order_id)
      .eq("subcontractors.company_id", companyId)
      .single();

    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      );
    }

    // Check if work order is approved
    if (workOrder.status !== "approved") {
      return NextResponse.json(
        { error: "Work order must be approved before creating payment" },
        { status: 400 }
      );
    }

    // Check if photos meet requirements
    const { data: photosMeetRequirements } = await supabase.rpc(
      "check_work_order_photos",
      { p_work_order_id: work_order_id }
    );

    if (!photosMeetRequirements) {
      return NextResponse.json(
        { error: "Work order photos do not meet requirements for payment release" },
        { status: 400 }
      );
    }

    // Create payment
    const { data: payment, error: paymentError } = await supabase
      .from("sub_payments")
      .insert({
        work_order_id,
        amount,
        payment_method,
        check_number,
        payment_date: payment_date || new Date().toISOString().split("T")[0],
        notes,
        created_by: user.id,
        status: "pending",
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Error creating payment:", paymentError);
      return NextResponse.json({ error: paymentError.message }, { status: 500 });
    }

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/subcontractors/payments:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























