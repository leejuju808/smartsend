// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// API Route: POST /api/material-orders/generate
// 
// Generates material list from roof measurements and creates a draft material order

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { job_id, supplier_id, delivery_date, delivery_instructions } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get job details to find workspace_id
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, address")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Generate material list from measurements
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Call the edge function to generate material list
    const generateResponse = await fetch(
      `${supabaseUrl}/functions/v1/generate-material-list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
        },
        body: JSON.stringify({ job_id }),
      }
    );

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error("Material list generation error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate material list" },
        { status: 500 }
      );
    }

    const { materials } = await generateResponse.json();

    if (!materials || materials.length === 0) {
      return NextResponse.json(
        { error: "No materials generated. Please ensure roof measurements exist for this job." },
        { status: 400 }
      );
    }

    // Create material order
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .insert({
        job_id,
        supplier_id: supplier_id || null,
        workspace_id: job.workspace_id,
        status: "draft",
        delivery_date: delivery_date || null,
        delivery_instructions: delivery_instructions || null,
        job_site_address: job.address || null,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Order creation error:", orderError);
      return NextResponse.json(
        { error: "Failed to create material order" },
        { status: 500 }
      );
    }

    // Create order items
    const orderItems = materials.map((material: any) => ({
      material_order_id: order.id,
      item_name: material.item_name,
      quantity: material.quantity,
      unit: material.unit,
      source: "auto_calculated",
    }));

    const { error: itemsError } = await supabase
      .from("material_order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Items creation error:", itemsError);
      // Clean up order if items fail
      await supabase.from("material_orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: "Failed to create order items" },
        { status: 500 }
      );
    }

    // Fetch complete order with items
    const { data: completeOrder, error: fetchError } = await supabase
      .from("material_orders")
      .select(`
        *,
        material_order_items (*),
        suppliers (*),
        roofing_jobs (id, title, address)
      `)
      .eq("id", order.id)
      .single();

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch created order" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      order: completeOrder,
    });
  } catch (error: any) {
    console.error("Error in POST /api/material-orders/generate:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































