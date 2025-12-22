// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// API Routes: PUT /api/suppliers/[supplier_id], DELETE /api/suppliers/[supplier_id]
// 
// Update and delete suppliers

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ supplier_id: string }> }
) {
  try {
    const { supplier_id } = await params;
    const body = await req.json();

    if (!supplier_id) {
      return NextResponse.json(
        { error: "Missing supplier_id" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: supplier, error } = await supabase
      .from("suppliers")
      .update({
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        address: body.address || null,
        delivery_cutoff: body.delivery_cutoff || null,
        delivery_instructions: body.delivery_instructions || null,
        account_number: body.account_number || null,
        notes: body.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", supplier_id)
      .select()
      .single();

    if (error) {
      console.error("Supplier update error:", error);
      return NextResponse.json(
        { error: "Failed to update supplier" },
        { status: 500 }
      );
    }

    return NextResponse.json({ supplier });
  } catch (error: any) {
    console.error("Error in PUT /api/suppliers/[supplier_id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ supplier_id: string }> }
) {
  try {
    const { supplier_id } = await params;

    if (!supplier_id) {
      return NextResponse.json(
        { error: "Missing supplier_id" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from("suppliers")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", supplier_id);

    if (error) {
      console.error("Supplier delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete supplier" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/suppliers/[supplier_id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































