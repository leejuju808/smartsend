// Block 255500 — SmartSend Repair Division Engine v1
// POST /api/repairs/[id]/photos
// Repair Photo Workflow - Mandatory before/during/after photos

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const formData = await req.formData();
    const photo_stage = formData.get("photo_stage") as string; // 'before', 'during', 'after'
    const files = formData.getAll("files") as File[];

    if (!photo_stage || !["before", "during", "after"].includes(photo_stage)) {
      return NextResponse.json(
        { error: "photo_stage must be 'before', 'during', or 'after'" },
        { status: 400 }
      );
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "At least one file is required" },
        { status: 400 }
      );
    }

    // Get repair job (not request - photos are for completed jobs)
    const { data: repairJob, error: jobError } = await supabase
      .from("repair_jobs")
      .select("id, repair_request_id, team_id, tech_id, status")
      .eq("id", id)
      .single();

    if (jobError || !repairJob) {
      return NextResponse.json(
        { error: "Repair job not found" },
        { status: 404 }
      );
    }

    // Verify tech is uploading (or admin)
    if (repairJob.tech_id && user.id !== repairJob.tech_id) {
      // Allow if user is team admin (would need additional check)
      // For now, allow if authenticated
    }

    const uploadedPhotos: string[] = [];

    // Upload each file
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        continue; // Skip non-image files
      }

      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `${repairJob.team_id}/repairs/${id}/${photo_stage}/${fileName}`;

      // Convert file to array buffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("repair-photos")
        .upload(storagePath, uint8Array, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("repair-photos")
        .getPublicUrl(storagePath);

      uploadedPhotos.push(urlData.publicUrl);
    }

    if (uploadedPhotos.length === 0) {
      return NextResponse.json(
        { error: "Failed to upload any photos" },
        { status: 500 }
      );
    }

    // Update repair job with photos
    const currentPhotos = repairJob[`photos_${photo_stage}` as keyof typeof repairJob] as string[] || [];
    const updatedPhotos = [...currentPhotos, ...uploadedPhotos];

    const { data: updatedJob, error: updateError } = await supabase
      .from("repair_jobs")
      .update({
        [`photos_${photo_stage}`]: updatedPhotos,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update repair job with photos", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photos_uploaded: uploadedPhotos.length,
      photo_stage,
      photos: updatedPhotos,
      repair_job: updatedJob,
    });
  } catch (error: any) {
    console.error("Error in repair photos API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve photos
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data: repairJob, error: jobError } = await supabase
      .from("repair_jobs")
      .select("photos_before, photos_during, photos_after")
      .eq("id", id)
      .single();

    if (jobError || !repairJob) {
      return NextResponse.json(
        { error: "Repair job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      photos: {
        before: repairJob.photos_before || [],
        during: repairJob.photos_during || [],
        after: repairJob.photos_after || [],
      },
    });
  } catch (error: any) {
    console.error("Error in get repair photos API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















