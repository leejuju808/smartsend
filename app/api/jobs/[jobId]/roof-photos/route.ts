// Block 41200 — SmartSend Roofing "AI Roof Measurement + Diagram Engine" v1
// API Route: Upload Roof Photos for Measurement
// POST /api/jobs/[jobId]/roof-photos

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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

    // Parse form data
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const angle = formData.get("angle") as string;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    if (!angle || !["front", "back", "left", "right", "drone", "satellite"].includes(angle)) {
      return NextResponse.json(
        { error: "Valid angle is required (front, back, left, right, drone, satellite)" },
        { status: 400 }
      );
    }

    // Use service role client for storage operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const uploadedPhotos = [];

    // Upload each file
    for (const file of files) {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `${jobId}/${angle}/${fileName}`;

      // Convert file to array buffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await serviceSupabase.storage
        .from("roof-photos")
        .upload(storagePath, uint8Array, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        continue; // Skip this file but continue with others
      }

      // Get signed URL (private bucket)
      const { data: signedUrlData, error: signedUrlError } = await serviceSupabase.storage
        .from("roof-photos")
        .createSignedUrl(storagePath, 3600 * 24 * 365); // 1 year expiry

      if (signedUrlError) {
        console.error("Error creating signed URL:", signedUrlError);
        continue;
      }

      // Insert photo record
      const { data: photo, error: photoError } = await supabase
        .from("roof_photos")
        .insert({
          job_id: jobId,
          photo_url: signedUrlData.signedUrl,
          angle: angle,
        })
        .select()
        .single();

      if (photoError) {
        console.error("Error creating photo record:", photoError);
        continue;
      }

      uploadedPhotos.push({
        ...photo,
        signed_url: signedUrlData.signedUrl,
      });
    }

    if (uploadedPhotos.length === 0) {
      return NextResponse.json(
        { error: "Failed to upload any photos" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photos: uploadedPhotos,
    });
  } catch (error: any) {
    console.error("Error in roof photos upload API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Retrieve roof photos for a job
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

    // Get roof photos
    const { data: photos, error: photosError } = await supabase
      .from("roof_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (photosError) {
      return NextResponse.json(
        { error: "Failed to fetch photos" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photos: photos || [],
    });
  } catch (error: any) {
    console.error("Error in roof photos GET API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































