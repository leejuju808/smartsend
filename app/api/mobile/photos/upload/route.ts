// Block 238000 — SmartSend Mobile App v1
// POST /api/mobile/photos/upload
// Upload photos from mobile app (supports offline queue)

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate user
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

    const formData = await req.formData();
    const jobId = formData.get("job_id") as string;
    const label = formData.get("label") as string; // 'before', 'during', 'after', 'issue', 'safety'
    const notes = formData.get("notes") as string | null;
    const file = formData.get("file") as File | null;
    const offlineId = formData.get("offline_id") as string | null; // For offline queue tracking

    if (!jobId || !file) {
      return NextResponse.json(
        { error: "job_id and file are required" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage
    const serviceClient = createServiceClient();
    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${jobId}/${Date.now()}.${fileExt}`;
    const filePath = `job-photos/${fileName}`;

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error: uploadError } = await serviceClient.storage
      .from("job-media")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload photo", details: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = serviceClient.storage
      .from("job-media")
      .getPublicUrl(filePath);

    const photoUrl = urlData.publicUrl;

    // Save photo metadata to database
    const { data: photoRecord, error: dbError } = await supabase
      .from("job_photos")
      .insert({
        job_id: jobId,
        photo_url: photoUrl,
        label: label || "during",
        notes: notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Try to clean up uploaded file
      await serviceClient.storage.from("job-media").remove([filePath]);
      return NextResponse.json(
        { error: "Failed to save photo record", details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photo: {
        id: photoRecord.id,
        job_id: photoRecord.job_id,
        photo_url: photoRecord.photo_url,
        label: photoRecord.label,
        notes: photoRecord.notes,
        created_at: photoRecord.created_at,
      },
      offline_id: offlineId, // Return for offline queue cleanup
    });
  } catch (error: any) {
    console.error("Error in photo upload API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/mobile/photos/upload?job_id=xxx
// Get photos for a job
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

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

    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    const { data: photos, error } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photos: photos || [],
    });
  } catch (error: any) {
    console.error("Error fetching photos:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























