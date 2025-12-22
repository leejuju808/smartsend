// Block 223000 — Material List Generator + Supplier Order Integration
// POST /api/suppliers/orders/delivery-update
// Update delivery status (confirmed / scheduled / delivered)

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
    const { supplier_order_id, status, notes } = body;

    if (!supplier_order_id || !status) {
      return NextResponse.json(
        { error: "supplier_order_id and status are required" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ["confirmed", "scheduled", "delivered"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${validStatuses.join(", ")}` },
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

    // Map status to event type
    const eventTypeMap: Record<string, string> = {
      confirmed: "scheduled",
      scheduled: "scheduled",
      delivered: "delivered",
    };

    const eventType = eventTypeMap[status] || "scheduled";

    // Update order status
    const { error: updateError } = await supabase
      .from("supplier_orders")
      .update({ status: status })
      .eq("id", supplier_order_id);

    if (updateError) {
      console.error("Error updating supplier order:", updateError);
      return NextResponse.json(
        { error: "Failed to update supplier order" },
        { status: 500 }
      );
    }

    // Create delivery event
    const { error: eventError } = await supabase
      .from("delivery_events")
      .insert({
        supplier_order_id: supplier_order_id,
        event_type: eventType,
        notes: notes || `Status updated to ${status}`,
      });

    if (eventError) {
      console.error("Error creating delivery event:", eventError);
      // Don't fail the request if event creation fails
    }

    return NextResponse.json({
      success: true,
      message: `Supplier order status updated to ${status}`,
    });
  } catch (error: any) {
    console.error("Error in delivery-update route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























