// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// API Route: GET /api/material-orders
// 
// Get material orders (optionally filtered by job_id or workspace_id)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = req.nextUrl;
    const job_id = searchParams.get("job_id");
    const workspace_id = searchParams.get("workspace_id");

    let query = supabase
      .from("material_orders")
      .select(`
        *,
        material_order_items (*),
        suppliers (*),
        roofing_jobs (id, title, address, homeowner_name)
      `)
      .order("created_at", { ascending: false });

    if (job_id) {
      query = query.eq("job_id", job_id);
    }

    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Orders fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch material orders" },
        { status: 500 }
      );
    }

    // If filtering by job_id, return single order or null
    if (job_id) {
      return NextResponse.json({ order: orders?.[0] || null });
    }

    return NextResponse.json({ orders: orders || [] });
  } catch (error: any) {
    console.error("Error in GET /api/material-orders:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































