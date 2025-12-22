// Block 228000 — Approve Change Order (Homeowner Portal)
// POST /api/change-orders/approve
// Approves a change order from homeowner portal

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { change_order_id, portal_token, signature_data, signed_by } = await req.json();

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
        { error: "Change order is already approved" },
        { status: 400 }
      );
    }

    if (changeOrder.status === "declined") {
      return NextResponse.json(
        { error: "Change order has been declined" },
        { status: 400 }
      );
    }

    // Update change order status
    const updateData: any = {
      status: "approved",
      signed_at: new Date().toISOString(),
      signed_by: signed_by || null,
    };

    if (signature_data) {
      // Store signature URL if provided
      updateData.signature_url = signature_data;
    }

    const { error: updateError } = await supabase
      .from("change_orders")
      .update(updateData)
      .eq("id", changeOrder.id);

    if (updateError) {
      console.error("Error approving change order:", updateError);
      return NextResponse.json(
        { error: "Failed to approve change order" },
        { status: 500 }
      );
    }

    // Trigger payment schedule update
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/change-orders/update-payment-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change_order_id: changeOrder.id }),
      });
    } catch (err) {
      // Non-critical, payment schedule update can happen async
      console.error("Failed to update payment schedule:", err);
    }

    // The database trigger will update job contract value automatically

    return NextResponse.json({
      success: true,
      change_order_id: changeOrder.id,
      job_id: changeOrder.job_id,
      added_cost: changeOrder.added_cost,
      message: "Change order approved successfully",
    });
  } catch (error: any) {
    console.error("Error approving change order:", error);
    return NextResponse.json(
      { error: error.message || "Failed to approve change order" },
      { status: 500 }
    );
  }
}
