// Block 247000 — SmartSend Roofing Field Vision v1
// API Route: Feed Into Estimate
// POST /api/fieldvision/estimate/push

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { scanId, leadId } = body;

    if (!scanId) {
      return NextResponse.json(
        { error: "scanId is required" },
        { status: 400 }
      );
    }

    // Get scan
    const { data: scan, error: scanError } = await serviceSupabase
      .from("roof_scans")
      .select("*, job:jobs(lead_id)")
      .eq("id", scanId)
      .single();

    if (scanError || !scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Determine lead_id
    const finalLeadId = leadId || (scan.job as any)?.lead_id;

    if (!finalLeadId) {
      return NextResponse.json(
        { error: "leadId is required (not found in scan or job)" },
        { status: 400 }
      );
    }

    // Update instant estimate from scan
    const { data: estimateResult, error: estimateError } =
      await serviceSupabase.rpc("update_estimate_from_scan", {
        p_scan_id: scanId,
        p_lead_id: finalLeadId,
      });

    if (estimateError) {
      console.error("Error updating estimate:", estimateError);
      return NextResponse.json(
        {
          error: "Failed to update estimate",
          details: estimateError.message,
        },
        { status: 500 }
      );
    }

    // Get scope items to add to estimate
    const { data: scopeItems } = await serviceSupabase
      .from("field_vision_scope_items")
      .select("*")
      .eq("scan_id", scanId)
      .eq("status", "generated");

    return NextResponse.json({
      success: true,
      estimate_updated: estimateResult?.updated || false,
      estimate_id: estimateResult?.estimate_id || null,
      scope_items: scopeItems || [],
      measurements: {
        total_area: scan.total_area,
        total_squares: scan.total_squares,
        pitch: scan.pitch,
        waste_factor: scan.waste_factor,
      },
      message: "Measurements pushed to estimate successfully",
    });
  } catch (error: any) {
    console.error("Error in fieldvision estimate push:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























