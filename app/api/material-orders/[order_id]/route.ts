// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// API Routes: GET /api/material-orders/[order_id], PUT /api/material-orders/[order_id]
// 
// Get and update material orders

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ order_id: string }> }
) {
  try {
    const { order_id } = await params;

    if (!order_id) {
      return NextResponse.json(
        { error: "Missing order_id" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order, error } = await supabase
      .from("material_orders")
      .select(`
        *,
        material_order_items (*),
        suppliers (*),
        roofing_jobs (id, title, address, homeowner_name)
      `)
      .eq("id", order_id)
      .single();

    if (error) {
      console.error("Order fetch error:", error);
      return NextResponse.json(
        { error: "Material order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ order });
  } catch (error: any) {
    console.error("Error in GET /api/material-orders/[order_id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ order_id: string }> }
) {
  try {
    const { order_id } = await params;
    const body = await req.json();

    if (!order_id) {
      return NextResponse.json(
        { error: "Missing order_id" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Update order
    const { data: order, error: updateError } = await supabase
      .from("material_orders")
      .update({
        supplier_id: body.supplier_id,
        delivery_date: body.delivery_date,
        delivery_instructions: body.delivery_instructions,
        crew_details: body.crew_details,
        notes: body.notes,
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id)
      .select()
      .single();

    if (updateError) {
      console.error("Order update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update material order" },
        { status: 500 }
      );
    }

    // If items are provided, update them
    if (body.items && Array.isArray(body.items)) {
      // Delete existing items
      await supabase
        .from("material_order_items")
        .delete()
        .eq("material_order_id", order_id);

      // Insert new items
      const itemsToInsert = body.items.map((item: any) => ({
        material_order_id: order_id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price || null,
        total_price: item.total_price || null,
        brand: item.brand || null,
        model: item.model || null,
        color: item.color || null,
        source: item.source || "manual",
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase
        .from("material_order_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.error("Items update error:", itemsError);
        // Don't fail the request, items update is secondary
      }
    }

    // Fetch complete order with items
    const { data: completeOrder } = await supabase
      .from("material_orders")
      .select(`
        *,
        material_order_items (*),
        suppliers (*),
        roofing_jobs (id, title, address)
      `)
      .eq("id", order_id)
      .single();

    return NextResponse.json({ order: completeOrder });
  } catch (error: any) {
    console.error("Error in PUT /api/material-orders/[order_id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































