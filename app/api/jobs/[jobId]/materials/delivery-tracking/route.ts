// Block 25260 — SmartSend Roofing Supplier & Material Sync v1
// API Route: Delivery Tracking
// GET/POST /api/jobs/[jobId]/materials/delivery-tracking

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get delivery tracking info
    const { data: deliveries, error: deliveryError } = await supabase
      .from("material_deliveries")
      .select(`
        *,
        material_orders (*)
      `)
      .eq("job_id", jobId)
      .order("delivery_date", { ascending: false });

    if (deliveryError) {
      return NextResponse.json(
        { error: deliveryError.message || "Failed to fetch deliveries" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      deliveries: deliveries || [],
    });
  } catch (error: any) {
    console.error("Error in delivery tracking API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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
      material_order_id,
      delivery_date,
      delivery_window_start,
      delivery_window_end,
      supplier_eta,
      driver_name,
      driver_phone,
      status,
    } = body;

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Create or update delivery record
    const { data: delivery, error: deliveryError } = await supabase
      .from("material_deliveries")
      .upsert(
        {
          material_order_id,
          workspace_id: job.workspace_id,
          job_id: jobId,
          delivery_date,
          delivery_window_start,
          delivery_window_end,
          supplier_eta,
          driver_name,
          driver_phone,
          status: status || "scheduled",
        },
        {
          onConflict: "material_order_id",
        }
      )
      .select()
      .single();

    if (deliveryError) {
      return NextResponse.json(
        { error: deliveryError.message || "Failed to update delivery" },
        { status: 500 }
      );
    }

    // Log timeline event
    await supabase.rpc("log_job_timeline_event", {
      p_job_id: jobId,
      p_lead_id: null,
      p_event_type: "supplier_delivery_scheduled",
      p_message: `Delivery scheduled for ${delivery_date}`,
      p_event_data: {
        delivery_id: delivery.id,
        delivery_date,
        driver_name,
      },
    });

    return NextResponse.json({
      success: true,
      delivery,
    });
  } catch (error: any) {
    console.error("Error in delivery tracking update API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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
    const { delivery_id, arrival_confirmed, arrival_confirmed_by, arrival_notes } = body;

    // Update delivery arrival confirmation
    const { data: delivery, error: deliveryError } = await supabase
      .from("material_deliveries")
      .update({
        arrival_confirmed: arrival_confirmed ?? true,
        arrival_confirmed_at: arrival_confirmed ? new Date().toISOString() : null,
        arrival_confirmed_by: arrival_confirmed_by || "crew",
        arrival_notes,
      })
      .eq("id", delivery_id)
      .eq("job_id", jobId)
      .select()
      .single();

    if (deliveryError) {
      return NextResponse.json(
        { error: deliveryError.message || "Failed to confirm arrival" },
        { status: 500 }
      );
    }

    // Log timeline event
    await supabase.rpc("log_job_timeline_event", {
      p_job_id: jobId,
      p_lead_id: null,
      p_event_type: "material_delivery_confirmed",
      p_message: `Delivery arrival confirmed by ${arrival_confirmed_by || "crew"}`,
      p_event_data: {
        delivery_id,
        confirmed_by: arrival_confirmed_by,
      },
    });

    return NextResponse.json({
      success: true,
      delivery,
    });
  } catch (error: any) {
    console.error("Error in delivery confirmation API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































