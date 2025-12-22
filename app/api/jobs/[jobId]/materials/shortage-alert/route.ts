// Block 25260 — SmartSend Roofing Supplier & Material Sync v1
// API Route: Material Shortage Alert
// POST /api/jobs/[jobId]/materials/shortage-alert

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      item_description,
      shortage_type,
      quantity_needed,
      detected_text,
      issued_by = "crew",
    } = body;

    if (!item_description) {
      return NextResponse.json(
        { error: "item_description is required" },
        { status: 400 }
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

    // Get latest material order
    const { data: order } = await supabase
      .from("material_orders")
      .select("id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Create shortage alert
    const { data: alert, error: alertError } = await supabase
      .from("material_shortage_alerts")
      .insert({
        job_id: jobId,
        material_order_id: order?.id || null,
        workspace_id: job.workspace_id,
        detected_from: "crew",
        detected_text: detected_text || item_description,
        shortage_type: shortage_type || "missing_item",
        item_description,
        quantity_needed: quantity_needed || null,
        issued_by,
        issued_by_user_id: user.id,
        issued_at: new Date().toISOString(),
        status: "detected",
      })
      .select()
      .single();

    if (alertError) {
      return NextResponse.json(
        { error: alertError.message || "Failed to create alert" },
        { status: 500 }
      );
    }

    // Handle alert (alerts ops, creates task, delays schedule)
    const { data: result, error: handleError } = await supabase.rpc(
      "handle_material_shortage_alert",
      {
        p_alert_id: alert.id,
      }
    );

    if (handleError) {
      console.error("Error handling alert:", handleError);
      // Continue anyway, alert was created
    }

    return NextResponse.json({
      success: true,
      alert,
      result: result || null,
    });
  } catch (error: any) {
    console.error("Error in shortage alert API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































