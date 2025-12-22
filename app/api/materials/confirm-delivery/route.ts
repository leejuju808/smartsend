// Block 62000 — SmartSend Roofing Material Delivery Confirmation API v1
// POST /api/materials/confirm-delivery
// Supplier or contractor confirms delivered materials

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { order_id, delivered_items, notes } = body;

    if (!order_id) {
      return NextResponse.json({ error: "order_id is required" }, { status: 400 });
    }

    // Verify user has access to this order
    const { data: order, error: orderError } = await supabase
      .from("supplier_orders")
      .select("workspace_id")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/materials-confirm-delivery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        order_id,
        delivered_items,
        notes
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to confirm delivery", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in /api/materials/confirm-delivery:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





























