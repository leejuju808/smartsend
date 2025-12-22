// Block 42000 — SmartSend Roofing Crew App v1
// API Route: Create Change Order
// POST /api/crew/change-orders/create

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const { job_id, member_id, description, photo_id, suggested_price } = body;

    if (!job_id || !member_id || !description) {
      return NextResponse.json(
        { error: "job_id, member_id, and description are required" },
        { status: 400 }
      );
    }

    // Verify job exists
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

    // Create change order
    const { data: changeOrder, error: changeOrderError } = await supabase
      .from("change_orders")
      .insert({
        job_id,
        member_id,
        description,
        photo_id: photo_id || null,
        suggested_price: suggested_price ? parseFloat(suggested_price) : null,
        status: "pending",
      })
      .select()
      .single();

    if (changeOrderError) {
      console.error("Error creating change order:", changeOrderError);
      return NextResponse.json(
        { error: "Failed to create change order", details: changeOrderError.message },
        { status: 500 }
      );
    }

    // Log activity
    await supabase
      .from("job_activity_log")
      .insert({
        job_id,
        member_id,
        type: "change_order",
        payload: {
          change_order_id: changeOrder.id,
          description,
          suggested_price: suggested_price ? parseFloat(suggested_price) : null,
        },
      });

    return NextResponse.json({
      success: true,
      change_order: changeOrder,
      message: "Change order created successfully",
    });
  } catch (error: any) {
    console.error("Error in create change order API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































