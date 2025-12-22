// Block 22320 — SmartSend Roofing Material Delivery & Supplier Tracker v1
// API Route: Mark Material Delivery
// POST /api/jobs/material-delivery

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
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

    const {
      material_order_id,
      job_id,
      delivery_date,
      status, // 'delivered','partial','delayed'
      delivered_by,
      notes,
    } = body;

    if (!material_order_id || !job_id || !status) {
      return NextResponse.json(
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    // Get order to grab workspace_id
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .select("id, workspace_id, job_id, supplier_id")
      .eq("id", material_order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", order.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const { error: insertError } = await supabase
      .from("material_deliveries")
      .insert({
        material_order_id,
        workspace_id: order.workspace_id,
        job_id,
        delivery_date: delivery_date || new Date().toISOString().slice(0, 10),
        status,
        delivered_by,
        notes,
      });

    if (insertError) {
      console.error(insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Update order status if fully delivered
    const newOrderStatus =
      status === "delivered"
        ? "delivered"
        : status === "partial"
        ? "partial"
        : "ordered";

    await supabase
      .from("material_orders")
      .update({
        status: newOrderStatus,
        actual_delivery_date:
          delivery_date || new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", material_order_id);

    // Sync job material_status (trigger should handle this, but call explicitly to be safe)
    await supabase.rpc("sync_job_material_status", { p_job_id: job_id });

    // Trigger reliability recalculation for this supplier (async, don't block response)
    if (order.supplier_id && ['delivered', 'partial', 'delayed'].includes(status)) {
      // Fire and forget - don't await
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/supplier-compute-reliability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ workspace_id: order.workspace_id }),
      }).catch((err) => {
        console.error("Error triggering reliability computation:", err);
        // Silently fail - reliability will be recalculated on next cron run
      });
    }

    return NextResponse.json(
      { success: true },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in material-delivery:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


