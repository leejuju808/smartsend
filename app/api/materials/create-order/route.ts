// Block 62000 — SmartSend Roofing Supplier Order Creation API
// POST /api/materials/create-order
// 
// Convert forecast → supplier order draft

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
    const {
      forecast_id,
      supplier_id,
      delivery_date,
      delivery_time = "morning",
      delivery_address,
      delivery_instructions,
    } = body;

    if (!forecast_id || !supplier_id || !delivery_date) {
      return NextResponse.json(
        { error: "Missing required fields: forecast_id, supplier_id, delivery_date" },
        { status: 400 }
      );
    }

    // Verify forecast exists and user has access
    const { data: forecast, error: forecastError } = await supabase
      .from("material_forecasts")
      .select("id, job_id, workspace_id, status")
      .eq("id", forecast_id)
      .single();

    if (forecastError || !forecast) {
      return NextResponse.json(
        { error: "Forecast not found" },
        { status: 404 }
      );
    }

    if (forecast.status !== "approved") {
      return NextResponse.json(
        { error: "Forecast must be approved before creating order" },
        { status: 400 }
      );
    }

    // Check workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", forecast.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Verify supplier exists
    const { data: supplier, error: supplierError } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", supplier_id)
      .single();

    if (supplierError || !supplier) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    // Call function to create supplier order from forecast
    const { data: orderId, error: orderError } = await supabase.rpc(
      "create_supplier_order_from_forecast",
      {
        p_forecast_id: forecast_id,
        p_supplier_id: supplier_id,
        p_delivery_date: delivery_date,
        p_delivery_time: delivery_time,
        p_delivery_address: delivery_address || null,
        p_delivery_instructions: delivery_instructions || null,
      }
    );

    if (orderError) {
      console.error("Order creation error:", orderError);
      return NextResponse.json(
        { error: orderError.message || "Failed to create supplier order" },
        { status: 500 }
      );
    }

    // Fetch the created order
    const { data: order, error: fetchError } = await supabase
      .from("supplier_orders")
      .select(`
        *,
        suppliers (*),
        material_forecasts (*)
      `)
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: "Order created but could not be retrieved" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      order: order,
    });
  } catch (error: any) {
    console.error("Error in POST /api/materials/create-order:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
