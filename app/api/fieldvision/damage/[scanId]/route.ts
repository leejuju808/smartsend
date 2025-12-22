// Block 247000 — SmartSend Roofing Field Vision v1
// API Route: Get Damage Report
// GET /api/fieldvision/damage/:scanId

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

    // Get damage report
    const { data: damageReport, error: damageError } = await serviceSupabase
      .from("damage_reports")
      .select("*")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (damageError && damageError.code !== "PGRST116") {
      // PGRST116 is "not found" - that's okay, no damage report yet
      console.error("Error getting damage report:", damageError);
      return NextResponse.json(
        { error: "Failed to get damage report", details: damageError.message },
        { status: 500 }
      );
    }

    // Get images with damage annotations
    const { data: images, error: imagesError } = await serviceSupabase
      .from("roof_images")
      .select("id, url, thumbnail_url, annotations, damage_detected")
      .eq("scan_id", scanId)
      .eq("damage_detected", true)
      .order("created_at", { ascending: true });

    if (imagesError) {
      console.error("Error getting images:", imagesError);
    }

    return NextResponse.json({
      success: true,
      damage_report: damageReport || null,
      damage_images: images || [],
      has_damage: damageReport ? damageReport.damage_severity_score > 0 : false,
    });
  } catch (error: any) {
    console.error("Error in fieldvision damage:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























