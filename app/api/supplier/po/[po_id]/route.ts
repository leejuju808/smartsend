// Block 241000 — SmartSend Roofing Supplier Hub v1
// GET /api/supplier/po/[po_id]
// Get single purchase order with full details

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ po_id: string }> }
) {
  try {
    const { po_id } = await params;
    
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!po_id) {
      return NextResponse.json(
        { error: "po_id is required" },
        { status: 400 }
      );
    }

    // Fetch PO with all related data
    const { data: po, error } = await supabase
      .from("purchase_orders")
      .select(`
        *,
        po_items (*),
        suppliers (*),
        jobs:job_id (id, address, homeowner_name, estimated_value),
        deliveries (*),
        material_verification (*),
        supplier_invoices (*)
      `)
      .eq("id", po_id)
      .single();

    if (error || !po) {
      return NextResponse.json(
        { error: "Purchase order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ po });
  } catch (error: any) {
    console.error("Error in GET /api/supplier/po/[po_id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ po_id: string }> }
) {
  try {
    const { po_id } = await params;
    
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!po_id) {
      return NextResponse.json(
        { error: "po_id is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      delivery_date,
      delivery_window,
      status,
      notes,
      items, // Optional: update items
    } = body;

    // Update PO
    const updateData: any = {};
    if (delivery_date !== undefined) updateData.delivery_date = delivery_date;
    if (delivery_window !== undefined) updateData.delivery_window = delivery_window;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const { data: updatedPo, error: updateError } = await supabase
      .from("purchase_orders")
      .update(updateData)
      .eq("id", po_id)
      .select()
      .single();

    if (updateError) {
      console.error("PO update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update purchase order" },
        { status: 500 }
      );
    }

    // Update items if provided
    if (items && Array.isArray(items)) {
      // Delete existing items
      await supabase.from("po_items").delete().eq("po_id", po_id);

      // Insert new items
      const poItems = items.map((item: any) => ({
        po_id,
        material_name: item.material_name,
        qty: item.qty,
        unit: item.unit || 'pieces',
        price: item.price || 0,
        notes: item.notes || null,
      }));

      await supabase.from("po_items").insert(poItems);
    }

    // Fetch complete PO
    const { data: completePo, error: fetchError } = await supabase
      .from("purchase_orders")
      .select(`
        *,
        po_items (*),
        suppliers (*),
        jobs:job_id (id, address, homeowner_name)
      `)
      .eq("id", po_id)
      .single();

    return NextResponse.json({ po: completePo || updatedPo });
  } catch (error: any) {
    console.error("Error in PATCH /api/supplier/po/[po_id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























