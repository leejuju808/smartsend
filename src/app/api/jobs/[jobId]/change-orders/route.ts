// Block 228000 — Get Change Orders for Job
// GET /api/jobs/[jobId]/change-orders

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get change orders with items
    const { data: changeOrders, error } = await supabase
      .from("change_orders")
      .select(`
        *,
        change_order_items (*)
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching change orders:", error);
      return NextResponse.json(
        { error: "Failed to fetch change orders" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      change_orders: changeOrders || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/jobs/[jobId]/change-orders:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























