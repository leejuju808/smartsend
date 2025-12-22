// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// API Route: GET /api/suppliers/spending
// 
// Get supplier spending dashboard data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = req.nextUrl;
    const workspace_id = searchParams.get("workspace_id");
    const start_date = searchParams.get("start_date");
    const end_date = searchParams.get("end_date");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Call the database function
    const { data, error } = await supabase.rpc(
      "get_supplier_spending_dashboard",
      {
        p_workspace_id: workspace_id,
        p_start_date: start_date || null,
        p_end_date: end_date || null,
      }
    );

    if (error) {
      console.error("Spending dashboard error:", error);
      return NextResponse.json(
        { error: "Failed to fetch spending data" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in GET /api/suppliers/spending:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































