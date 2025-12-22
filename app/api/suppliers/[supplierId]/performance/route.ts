// Block 25260 — SmartSend Roofing Supplier & Material Sync v1
// API Route: Supplier Performance
// GET /api/suppliers/[supplierId]/performance

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ supplierId: string }> }
) {
  try {
    const supabase = createClient();
    const { supplierId } = await params;

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

    // Get supplier
    const { data: supplier, error: supplierError } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", supplierId)
      .single();

    if (supplierError || !supplier) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", supplier.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Recalculate performance if needed (or force recalculation)
    const url = new URL(req.url);
    const forceRecalc = url.searchParams.get("recalculate") === "true";

    if (forceRecalc || !supplier.last_performance_calc_at) {
      const { error: calcError } = await supabase.rpc(
        "calculate_supplier_performance_score",
        {
          p_supplier_id: supplierId,
        }
      );

      if (calcError) {
        console.error("Error calculating performance:", calcError);
      } else {
        // Refetch supplier with updated scores
        const { data: updatedSupplier } = await supabase
          .from("suppliers")
          .select("*")
          .eq("id", supplierId)
          .single();

        if (updatedSupplier) {
          supplier = updatedSupplier;
        }
      }
    }

    // Get performance history
    const { data: history, error: historyError } = await supabase
      .from("supplier_performance_history")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("period_start", { ascending: false })
      .limit(12); // Last 12 periods

    // Get recent orders for context
    const { data: recentOrders, error: ordersError } = await supabase
      .from("material_orders")
      .select("id, status, expected_delivery_date, actual_delivery_date, issue_reported")
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      supplier: {
        id: supplier.id,
        name: supplier.name,
        supplier_grade: supplier.supplier_grade,
        on_time_delivery_pct: supplier.on_time_delivery_pct,
        accuracy_pct: supplier.accuracy_pct,
        shortage_frequency_pct: supplier.shortage_frequency_pct,
        avg_response_time_hours: supplier.avg_response_time_hours,
        total_orders_count: supplier.total_orders_count,
        on_time_delivery_count: supplier.on_time_delivery_count,
        late_delivery_count: supplier.late_delivery_count,
        issue_count: supplier.issue_count,
        last_performance_calc_at: supplier.last_performance_calc_at,
        performance_notes: supplier.performance_notes,
      },
      history: history || [],
      recentOrders: recentOrders || [],
    });
  } catch (error: any) {
    console.error("Error in supplier performance API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































