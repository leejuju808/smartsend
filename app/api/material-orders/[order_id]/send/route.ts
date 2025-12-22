// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// API Route: POST /api/material-orders/[order_id]/send
// 
// Sends material order PO to supplier via email

import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ order_id: string }> }
) {
  try {
    const { order_id } = await params;

    if (!order_id) {
      return NextResponse.json(
        { error: "Missing order_id" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Call the edge function to send the order
    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-material-order`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
        },
        body: JSON.stringify({ order_id }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        { error: "Failed to send material order" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/material-orders/[order_id]/send:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































