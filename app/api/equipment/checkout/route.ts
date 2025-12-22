// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// API Route: Equipment Checkout
// POST /api/equipment/checkout

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
    const { equipment_id, crew_member_id, job_id, checkout_notes, condition } = body;

    if (!equipment_id || !crew_member_id) {
      return NextResponse.json(
        { error: "equipment_id and crew_member_id are required" },
        { status: 400 }
      );
    }

    // Verify equipment exists
    const { data: equipment, error: equipmentError } = await supabase
      .from("equipment")
      .select("id, workspace_id, status")
      .eq("id", equipment_id)
      .single();

    if (equipmentError || !equipment) {
      return NextResponse.json(
        { error: "Equipment not found" },
        { status: 404 }
      );
    }

    // Check if already checked out
    if (equipment.status === "checked_out") {
      return NextResponse.json(
        { error: "Equipment is already checked out" },
        { status: 400 }
      );
    }

    // Call the database function
    const { data: checkoutId, error: checkoutError } = await supabase.rpc(
      "checkout_equipment",
      {
        p_equipment_id: equipment_id,
        p_crew_member_id: crew_member_id,
        p_job_id: job_id || null,
        p_checkout_notes: checkout_notes || null,
        p_condition: condition || "functional",
      }
    );

    if (checkoutError) {
      console.error("Error checking out equipment:", checkoutError);
      return NextResponse.json(
        { error: checkoutError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      checkout_id: checkoutId,
      message: "Equipment checked out successfully",
    });
  } catch (error: any) {
    console.error("Error in equipment checkout API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























