// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// API Route: Crew confirms materials received and placed

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await req.json();
    const { material_order_id } = body;

    if (!material_order_id) {
      return NextResponse.json(
        { error: "Missing material_order_id" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get order and verify access
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .select("workspace_id")
      .eq("id", material_order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", order.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Update order with crew confirmation
    const { error: updateError } = await supabase
      .from("material_orders")
      .update({
        crew_confirmed: true,
        crew_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", material_order_id);

    if (updateError) {
      console.error("Error updating order:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to confirm materials" },
        { status: 500 }
      );
    }

    // Trigger job status sync
    await supabase.rpc("sync_job_material_status", { p_job_id: jobId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error confirming materials:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































