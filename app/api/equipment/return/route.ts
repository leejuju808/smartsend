// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// API Route: Equipment Return
// POST /api/equipment/return

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { checkout_id, condition, return_notes, location } = body;

    if (!checkout_id || !condition) {
      return NextResponse.json(
        { error: "checkout_id and condition are required" },
        { status: 400 }
      );
    }

    // Verify checkout exists
    const { data: checkout, error: checkoutError } = await supabase
      .from("equipment_checkouts")
      .select("id, equipment_id, returned_at")
      .eq("id", checkout_id)
      .single();

    if (checkoutError || !checkout) {
      return NextResponse.json(
        { error: "Checkout not found" },
        { status: 404 }
      );
    }

    if (checkout.returned_at) {
      return NextResponse.json(
        { error: "Equipment already returned" },
        { status: 400 }
      );
    }

    // Call the database function
    const { data, error: returnError } = await supabase.rpc("return_equipment", {
      p_checkout_id: checkout_id,
      p_condition: condition,
      p_return_notes: return_notes || null,
      p_location: location || null,
    });

    if (returnError) {
      console.error("Error returning equipment:", returnError);
      return NextResponse.json(
        { error: returnError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Equipment returned successfully",
    });
  } catch (error: any) {
    console.error("Error in equipment return API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























