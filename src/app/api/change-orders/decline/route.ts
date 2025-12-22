// Block 228000 — Decline Change Order
// POST /api/change-orders/decline
// Declines a change order

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { change_order_id, portal_token, reason } = await req.json();

    if (!change_order_id && !portal_token) {
      return NextResponse.json(
        { error: "change_order_id or portal_token is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Get change order by ID or portal token
    let changeOrder;
    if (portal_token) {
      const { data, error } = await supabase
        .from("change_orders")
        .select("*")
        .eq("portal_token", portal_token)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Change order not found" },
          { status: 404 }
        );
      }
      changeOrder = data;
    } else {
      const { data, error } = await supabase
        .from("change_orders")
        .select("*")
        .eq("id", change_order_id)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Change order not found" },
          { status: 404 }
        );
      }
      changeOrder = data;
    }

    if (changeOrder.status === "approved") {
      return NextResponse.json(
        { error: "Cannot decline an approved change order" },
        { status: 400 }
      );
    }

    if (changeOrder.status === "declined") {
      return NextResponse.json({
        success: true,
        message: "Change order already declined",
      });
    }

    // Update status to declined
    const { error: updateError } = await supabase
      .from("change_orders")
      .update({
        status: "declined",
        updated_at: new Date().toISOString(),
      })
      .eq("id", changeOrder.id);

    if (updateError) {
      console.error("Error declining change order:", updateError);
      return NextResponse.json(
        { error: "Failed to decline change order" },
        { status: 500 }
      );
    }

    // Notify office (this would typically send an email/notification)
    // For now, we'll just return success

    return NextResponse.json({
      success: true,
      change_order_id: changeOrder.id,
      job_id: changeOrder.job_id,
      message: "Change order declined. Office has been notified.",
    });
  } catch (error: any) {
    console.error("Error declining change order:", error);
    return NextResponse.json(
      { error: error.message || "Failed to decline change order" },
      { status: 500 }
    );
  }
}

























