// PATCH /api/workforce/subcontractors/payments/[id] - Update payment status

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

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

    // Verify payment belongs to company
    const { data: existingPayment } = await supabase
      .from("sub_payments")
      .select(`
        id,
        sub_work_orders!inner(
          id,
          subcontractors!inner(company_id)
        )
      `)
      .eq("id", id)
      .eq("sub_work_orders.subcontractors.company_id", companyId)
      .single();

    if (!existingPayment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // Handle status changes
    const updates: any = { ...body };
    if (body.status === "released") {
      updates.released_at = new Date().toISOString();
      updates.released_by = user.id;
      
      // Update work order status to paid
      await supabase
        .from("sub_work_orders")
        .update({ status: "paid" })
        .eq("id", existingPayment.sub_work_orders.id);
    }

    const { data: payment, error } = await supabase
      .from("sub_payments")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating payment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ payment });
  } catch (error: any) {
    console.error("Error in PATCH payment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























