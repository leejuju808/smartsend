// Block 22430 — SmartSend Roofing Material Orders & Supplier Tracking v1
// API Route: Update Material Order Status
// POST /api/jobs/material-order/update-status

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
    const { order_id, status, message } = body;

    if (!order_id || !status) {
      return NextResponse.json(
        { error: "Missing required fields: order_id and status" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ['ordered', 'en_route', 'delivered', 'delayed', 'canceled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Get order to verify access
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .select("id, workspace_id, job_id, supplier_id")
      .eq("id", order_id)
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

    // Call edge function to update status and log to timeline
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    // Use service role for edge function call (or use direct DB update)
    // For now, we'll update directly and let the trigger handle timeline logging
    const { error: updateError } = await supabase
      .from("material_orders")
      .update({
        status: status,
        updated_at: new Date().toISOString(),
        // If status is delivered, set actual_delivery_date
        ...(status === 'delivered' && { actual_delivery_date: new Date().toISOString().split('T')[0] }),
      })
      .eq("id", order_id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Insert into material_order_updates (this will trigger timeline logging)
    const { error: insertError } = await supabase
      .from("material_order_updates")
      .insert({
        material_order_id: order_id,
        status: status,
        message: message || null,
      });

    if (insertError) {
      console.error("Error inserting material_order_updates:", insertError);
      // Don't fail the request if timeline logging fails
    }

    // Sync job material status
    if (order.job_id) {
      await supabase.rpc("sync_job_material_status", { p_job_id: order.job_id });
    }

    // Trigger reliability recalculation for this supplier (async, don't block response)
    // Only trigger for status changes that affect reliability (delivered, delayed, canceled)
    if (order.supplier_id && ['delivered', 'delayed', 'canceled'].includes(status)) {
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

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error updating material order status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

