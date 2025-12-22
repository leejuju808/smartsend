// Block 247000 — SmartSend Roofing Field Vision v1
// API Route: Mobile AR Measurement Data
// POST /api/fieldvision/ar/submit

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
    const {
      jobId,
      scanId,
      measurements, // Array of {type, length_feet, width_feet?, height_feet?, accuracy_percent, device_type, ar_platform, geolocation, image_url}
    } = body;

    if (!jobId || !measurements || !Array.isArray(measurements)) {
      return NextResponse.json(
        { error: "jobId and measurements array are required" },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await serviceSupabase
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get or create scan for AR measurements
    let finalScanId = scanId;
    if (!finalScanId) {
      const { data: newScan, error: scanError } = await serviceSupabase
        .from("roof_scans")
        .insert({
          job_id: jobId,
          user_id: user.id,
          type: "mobile_ar",
          status: "processing",
        })
        .select()
        .single();

      if (scanError) {
        console.error("Error creating scan:", scanError);
        return NextResponse.json(
          { error: "Failed to create scan", details: scanError.message },
          { status: 500 }
        );
      }

      finalScanId = newScan.id;
    }

    // Insert AR measurements
    const arMeasurements = measurements.map((m: any) => ({
      scan_id: finalScanId,
      job_id: jobId,
      user_id: user.id,
      measurement_type: m.type,
      length_feet: m.length_feet,
      width_feet: m.width_feet || null,
      height_feet: m.height_feet || null,
      accuracy_percent: m.accuracy_percent || null,
      device_type: m.device_type || null,
      ar_platform: m.ar_platform || null,
      geolocation: m.geolocation || null,
      image_url: m.image_url || null,
    }));

    const { data: insertedMeasurements, error: insertError } =
      await serviceSupabase
        .from("ar_measurements")
        .insert(arMeasurements)
        .select();

    if (insertError) {
      console.error("Error inserting AR measurements:", insertError);
      return NextResponse.json(
        {
          error: "Failed to save AR measurements",
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    // Update scan with aggregated AR data if available
    // (Could calculate total area, perimeter, etc. from AR measurements)

    return NextResponse.json({
      success: true,
      scan_id: finalScanId,
      measurements: insertedMeasurements,
      count: insertedMeasurements?.length || 0,
      message: "AR measurements submitted successfully",
    });
  } catch (error: any) {
    console.error("Error in fieldvision AR submit:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























