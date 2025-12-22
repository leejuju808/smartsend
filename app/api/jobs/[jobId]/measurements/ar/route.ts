// Block 190000 — SmartSend Roofing AI Roof Measurements v1
// API Route: AR Measurement (Mobile AR Scanner)
// POST /api/jobs/[jobId]/measurements/ar

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
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

    // Parse request body
    const body = await req.json();
    const { measurementData } = body;

    if (!measurementData) {
      return NextResponse.json(
        { error: "measurementData is required" },
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

    // Calculate waste factor based on complexity
    let wasteFactor = 0.10; // Default 10%
    if (measurementData.facets && measurementData.facets > 4) {
      wasteFactor = 0.12; // 12% for complex roofs
    }

    // Save AR measurement to database
    const { data: measurement, error: insertError } = await serviceSupabase
      .from("roof_measurements")
      .insert({
        job_id: jobId,
        method: "ar",
        squares: measurementData.squares || 0,
        ridges_length: 0, // AR scanner doesn't measure these directly
        eaves_length: measurementData.perimeter
          ? measurementData.perimeter / 4
          : 0, // Rough estimate
        hips_length: 0,
        valleys_length: 0,
        pitch: "unknown", // AR scanner doesn't measure pitch
        facets: measurementData.facets || 1,
        confidence: 0.75, // AR measurements are typically less accurate
        waste_factor: wasteFactor,
        raw_output: measurementData,
        image_urls: [],
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error saving AR measurement:", insertError);
      return NextResponse.json(
        { error: "Failed to save measurement", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      measurement,
      message: "AR measurement saved successfully",
    });
  } catch (error: any) {
    console.error("Error in AR measurement:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























