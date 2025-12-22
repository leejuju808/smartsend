// Block 247000 — SmartSend Roofing Field Vision v1
// API Route: Get Measurements
// GET /api/fieldvision/measurements/:scanId

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  try {
    const { scanId } = await params;
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

    // Get scan with summary
    const { data: summary, error: summaryError } = await serviceSupabase.rpc(
      "get_roof_scan_summary",
      {
        p_scan_id: scanId,
      }
    );

    if (summaryError) {
      console.error("Error getting scan summary:", summaryError);
      return NextResponse.json(
        { error: "Failed to get measurements", details: summaryError.message },
        { status: 500 }
      );
    }

    // Get full scan data
    const { data: scan, error: scanError } = await serviceSupabase
      .from("roof_scans")
      .select("*")
      .eq("id", scanId)
      .single();

    if (scanError || !scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Get scope items
    const { data: scopeItems } = await serviceSupabase
      .from("field_vision_scope_items")
      .select("*")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      success: true,
      scan,
      summary,
      scope_items: scopeItems || [],
      measurements: {
        total_area: scan.total_area,
        total_squares: scan.total_squares,
        pitch: scan.pitch,
        pitch_degrees: scan.pitch_degrees,
        facets: scan.facets,
        edges: scan.edges,
        perimeter: scan.perimeter,
        waste_factor: scan.waste_factor,
      },
    });
  } catch (error: any) {
    console.error("Error in fieldvision measurements:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























