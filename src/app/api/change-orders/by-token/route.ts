// Block 228000 — Get Change Order by Portal Token
// GET /api/change-orders/by-token?token=xxx
// Public endpoint for homeowner portal

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "token is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Get change order by portal token
    const { data: changeOrder, error } = await supabase
      .from("change_orders")
      .select(`
        *,
        change_order_items (*)
      `)
      .eq("portal_token", token)
      .single();

    if (error || !changeOrder) {
      return NextResponse.json(
        { error: "Change order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      change_order: changeOrder,
    });
  } catch (error: any) {
    console.error("Error fetching change order by token:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























