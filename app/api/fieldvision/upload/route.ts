// Block 247000 — SmartSend Roofing Field Vision v1
// API Route: Upload Drone Image
// POST /api/fieldvision/upload

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
    const { jobId, imageUrl, imageType, metadata } = body;

    if (!jobId || !imageUrl) {
      return NextResponse.json(
        { error: "jobId and imageUrl are required" },
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

    // Get or create roof scan for this job
    let { data: scan } = await serviceSupabase
      .from("roof_scans")
      .select("id")
      .eq("job_id", jobId)
      .eq("type", "drone")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Create scan if it doesn't exist
    if (!scan) {
      const { data: newScan, error: scanError } = await serviceSupabase
        .from("roof_scans")
        .insert({
          job_id: jobId,
          user_id: user.id,
          type: "drone",
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

      scan = newScan;
    }

    // Insert image
    const { data: image, error: imageError } = await serviceSupabase
      .from("roof_images")
      .insert({
        scan_id: scan.id,
        url: imageUrl,
        image_type: imageType || "top_down",
        geolocation: metadata?.geolocation || null,
        captured_at: metadata?.capturedAt || new Date().toISOString(),
        file_size: metadata?.fileSize || null,
        width: metadata?.width || null,
        height: metadata?.height || null,
      })
      .select()
      .single();

    if (imageError) {
      console.error("Error inserting image:", imageError);
      return NextResponse.json(
        { error: "Failed to upload image", details: imageError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      scan_id: scan.id,
      image_id: image.id,
      message: "Image uploaded successfully",
    });
  } catch (error: any) {
    console.error("Error in fieldvision upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























