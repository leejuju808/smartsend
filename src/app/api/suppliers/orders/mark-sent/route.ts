// Block 223000 — Material List Generator + Supplier Order Integration
// POST /api/suppliers/orders/mark-sent
// Mark order as sent with PO number and delivery details

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      supplier_order_id,
      po_number,
      requested_delivery_date,
      requested_delivery_window,
      drop_location,
      notes,
    } = body;

    if (!supplier_order_id) {
      return NextResponse.json(
        { error: "supplier_order_id is required" },
        { status: 400 }
      );
    }

    // Get supplier order and verify access
    const { data: supplierOrder, error: orderError } = await supabase
      .from("supplier_orders")
      .select(`
        id,
        company_id,
        roofing_companies!inner(owner_id)
      `)
      .eq("id", supplier_order_id)
      .single();

    if (orderError || !supplierOrder) {
      return NextResponse.json(
        { error: "Supplier order not found" },
        { status: 404 }
      );
    }

    // Verify access
    const company = (supplierOrder as any).roofing_companies;
    if (!company || company.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Update order
    const updateData: any = {
      status: "sent",
    };

    if (po_number) updateData.po_number = po_number;
    if (requested_delivery_date) updateData.requested_delivery_date = requested_delivery_date;
    if (requested_delivery_window) updateData.requested_delivery_window = requested_delivery_window;
    if (drop_location) updateData.drop_location = drop_location;
    if (notes !== undefined) updateData.notes = notes;

    const { error: updateError } = await supabase
      .from("supplier_orders")
      .update(updateData)
      .eq("id", supplier_order_id);

    if (updateError) {
      console.error("Error updating supplier order:", updateError);
      return NextResponse.json(
        { error: "Failed to update supplier order" },
        { status: 500 }
      );
    }

    // Create delivery event
    await supabase.from("delivery_events").insert({
      supplier_order_id: supplier_order_id,
      event_type: "scheduled",
      notes: notes || "Order marked as sent",
    });

    return NextResponse.json({
      success: true,
      message: "Supplier order marked as sent",
    });
  } catch (error: any) {
    console.error("Error in mark-sent route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























