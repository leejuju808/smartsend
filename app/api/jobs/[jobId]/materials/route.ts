// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// API Route: Get materials data for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job to verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get takeoff
    const { data: takeoff } = await supabase
      .from("material_takeoffs")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    // Get material order
    const { data: order } = await supabase
      .from("material_orders")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get supplier if order exists
    let supplier = null;
    if (order?.supplier_id) {
      const { data: supplierData } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", order.supplier_id)
        .single();
      supplier = supplierData;
    }

    // Get purchase order
    let purchaseOrder = null;
    if (order?.id) {
      const { data: poData } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("material_order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      purchaseOrder = poData;
    }

    // Get order items
    let items = [];
    if (order?.id) {
      const { data: itemsData } = await supabase
        .from("material_order_items")
        .select("*")
        .eq("material_order_id", order.id);
      items = itemsData || [];
    }

    // Get deliveries
    const { data: deliveries } = await supabase
      .from("material_deliveries")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      takeoff: takeoff || null,
      order: order ? { ...order, items } : null,
      purchaseOrder,
      deliveries: deliveries || [],
      supplier,
    });
  } catch (error: any) {
    console.error("Error fetching materials:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
