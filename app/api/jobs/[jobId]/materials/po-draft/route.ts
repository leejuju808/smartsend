// Block 25260 — SmartSend Roofing Supplier & Material Sync v1
// API Route: Get/Create PO Draft
// GET/POST /api/jobs/[jobId]/materials/po-draft

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

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get material order and PO
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .select(`
        *,
        purchase_orders (*),
        material_takeoffs (*),
        suppliers (*)
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (orderError && orderError.code !== "PGRST116") {
      return NextResponse.json(
        { error: orderError.message || "Failed to fetch order" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      order: order || null,
      hasOrder: !!order,
    });
  } catch (error: any) {
    console.error("Error in PO draft API:", error);
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
    const { supplier_id, expected_delivery_date, notes } = body;

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

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get takeoff if exists
    const { data: takeoff } = await supabase
      .from("material_takeoffs")
      .select("id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Create material order draft
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .insert({
        workspace_id: job.workspace_id,
        job_id: jobId,
        supplier_id: supplier_id || null,
        takeoff_id: takeoff?.id || null,
        status: "draft",
        expected_delivery_date: expected_delivery_date || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (orderError) {
      return NextResponse.json(
        { error: orderError.message || "Failed to create order" },
        { status: 500 }
      );
    }

    // Generate PO draft
    const { data: po, error: poError } = await supabase.rpc(
      "generate_purchase_order",
      {
        p_material_order_id: order.id,
      }
    );

    if (poError) {
      console.error("Error generating PO:", poError);
      // Continue anyway, order was created
    }

    // Log timeline event
    await supabase.rpc("log_job_timeline_event", {
      p_job_id: jobId,
      p_lead_id: null,
      p_event_type: "material_po_created",
      p_event_subtype: "manual_draft",
      p_message: "PO draft created",
      p_event_data: {
        material_order_id: order.id,
        po_id: po || null,
      },
    });

    return NextResponse.json({
      success: true,
      order,
      po: po || null,
    });
  } catch (error: any) {
    console.error("Error in PO draft creation API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































