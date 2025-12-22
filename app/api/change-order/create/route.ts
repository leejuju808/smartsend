// Block 27700 — SmartSend Roofing Change Order Engine v1
// API Route: POST /api/change-order/create
// Create a new change order

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, reason_category, items } = body;

    if (!job_id || !reason_category || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "job_id, reason_category, and items array are required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", job.workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Create change order header
    const { data: co, error: coError } = await supabase
      .from("roofing_change_orders")
      .insert({
        job_id,
        workspace_id: job.workspace_id,
        reason_category,
        status: "draft",
        created_by: user.id,
      })
      .select("*")
      .single();

    if (coError || !co) {
      console.error("Error creating change order:", coError);
      return NextResponse.json(
        { error: "Failed to create change order" },
        { status: 500 }
      );
    }

    // Insert items
    const itemsToInsert = items.map((item: any) => ({
      change_order_id: co.id,
      description: item.description,
      quantity: item.quantity || 1,
      unit_cost: item.unit_cost,
    }));

    const { error: itemsError } = await supabase
      .from("roofing_change_order_items")
      .insert(itemsToInsert);

    if (itemsError) {
      console.error("Error inserting items:", itemsError);
      // Clean up change order if items fail
      await supabase.from("roofing_change_orders").delete().eq("id", co.id);
      return NextResponse.json(
        { error: "Failed to create change order items" },
        { status: 500 }
      );
    }

    // Calculate total
    const total = items.reduce(
      (sum: number, item: any) => sum + (item.quantity || 1) * item.unit_cost,
      0
    );

    // Create revenue impact record
    const { error: revenueError } = await supabase
      .from("roofing_change_order_revenue")
      .insert({
        job_id,
        change_order_id: co.id,
        amount: total,
        approved: false,
      });

    if (revenueError) {
      console.error("Error creating revenue record:", revenueError);
      // Don't fail the request, but log the error
    }

    return NextResponse.json({
      status: "created",
      change_order_id: co.id,
      total,
    });
  } catch (error: any) {
    console.error("Error in POST /api/change-order/create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































