// Block 41200 — SmartSend Roofing "AI Roof Measurement + Diagram Engine" v1
// API Route: Trigger AI Roof Measurement
// POST /api/jobs/[jobId]/measure-roof

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    // Verify authentication
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
      .from("jobs")
      .select("id, team_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get roof photos for this job
    const { data: photos, error: photosError } = await supabase
      .from("roof_photos")
      .select("photo_url")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (photosError || !photos || photos.length === 0) {
      return NextResponse.json(
        { error: "No roof photos found. Please upload photos first." },
        { status: 400 }
      );
    }

    // Minimum 3 photos required for accurate measurement
    if (photos.length < 3) {
      return NextResponse.json(
        { error: "At least 3 photos are required for measurement. Please upload more photos." },
        { status: 400 }
      );
    }

    // Call edge function for measurement
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const photoUrls = photos.map((p) => p.photo_url);

    const response = await fetch(`${supabaseUrl}/functions/v1/measure-roof`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        job_id: jobId,
        photos: photoUrls,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.error || "Failed to measure roof" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Trigger diagram generation
    try {
      const diagramResponse = await fetch(`${supabaseUrl}/functions/v1/generate-roof-diagram`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          job_id: jobId,
          measurement_id: data.measurement.id,
        }),
      });

      if (diagramResponse.ok) {
        const diagramData = await diagramResponse.json();
        data.diagramUrl = diagramData.diagramUrl;
      }
    } catch (diagramError) {
      console.error("Error generating diagram:", diagramError);
      // Don't fail the request if diagram generation fails
    }

    return NextResponse.json({
      success: true,
      measurement: data.measurement,
      diagramUrl: data.diagramUrl,
    });
  } catch (error: any) {
    console.error("Error in measure-roof API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Retrieve measurement for a job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    // Verify authentication
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

    // Get latest measurement
    const { data: measurement, error: measurementError } = await supabase
      .from("roof_measurements")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (measurementError) {
      if (measurementError.code === "PGRST116") {
        // No measurement found
        return NextResponse.json({
          success: true,
          measurement: null,
        });
      }
      return NextResponse.json(
        { error: "Failed to fetch measurement" },
        { status: 500 }
      );
    }

    // Get material estimates
    const { data: materials, error: materialsError } = await supabase
      .from("roof_material_estimates")
      .select("*")
      .eq("measurement_id", measurement.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      success: true,
      measurement,
      materials: materials || [],
    });
  } catch (error: any) {
    console.error("Error in measure-roof GET API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































