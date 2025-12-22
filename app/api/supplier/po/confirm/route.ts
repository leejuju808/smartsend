// Block 241000 — SmartSend Roofing Supplier Hub v1
// POST /api/supplier/po/confirm
// Confirm delivery time with supplier

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      po_id,
      confirmed_delivery_date,
      confirmed_delivery_window,
      notes,
    } = body;

    if (!po_id || !confirmed_delivery_date) {
      return NextResponse.json(
        { error: "po_id and confirmed_delivery_date are required" },
        { status: 400 }
      );
    }

    // Update PO with confirmed delivery info
    const { data: updatedPo, error: updateError } = await supabase
      .from("purchase_orders")
      .update({
        delivery_date: confirmed_delivery_date,
        delivery_window: confirmed_delivery_window || 'Any',
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq("id", po_id)
      .select(`
        *,
        po_items (*),
        suppliers (*),
        jobs:job_id (id, address, homeowner_name)
      `)
      .single();

    if (updateError) {
      console.error("PO confirmation error:", updateError);
      return NextResponse.json(
        { error: "Failed to confirm delivery" },
        { status: 500 }
      );
    }

    // TODO: Notify crew 24 hours before delivery
    // This can be done via a cron job or webhook

    return NextResponse.json({ 
      po: updatedPo,
      message: "Delivery confirmed successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/supplier/po/confirm:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























