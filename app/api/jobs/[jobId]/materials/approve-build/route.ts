// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// API Route: Approve materials for build (moves job to Ready to Install)

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
      .select("workspace_id, job_id")
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

    // Update order - approve for build
    const { error: updateError } = await supabase
      .from("material_orders")
      .update({
        materials_approved_for_build: true,
        materials_approved_at: new Date().toISOString(),
        status: "materials_approved_for_build",
        updated_at: new Date().toISOString(),
      })
      .eq("id", material_order_id);

    if (updateError) {
      console.error("Error updating order:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to approve materials" },
        { status: 500 }
      );
    }

    // Update job status to "ready to install" if materials are approved
    const { error: jobUpdateError } = await supabase
      .from("roofing_jobs")
      .update({
        status: "scheduled", // or "ready_to_install" if you have that status
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (jobUpdateError) {
      console.error("Error updating job status:", jobUpdateError);
      // Don't fail the request if job update fails
    }

    // Trigger job status sync
    await supabase.rpc("sync_job_material_status", { p_job_id: jobId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error approving materials:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































