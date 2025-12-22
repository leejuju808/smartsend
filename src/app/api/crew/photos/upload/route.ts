// Block 225000 — SmartSend Roofing Crew App v1
// POST /api/crew/photos/upload
// Uploads photos and stores in Supabase Storage → links to daily log

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const jobId = formData.get("jobId") as string;
    const crewId = formData.get("crewId") as string;
    const dailyLogId = formData.get("dailyLogId") as string;
    const category = formData.get("category") as string;
    const notes = formData.get("notes") as string;
    const files = formData.getAll("files") as File[];

    if (!jobId || !crewId || !category || files.length === 0) {
      return NextResponse.json(
        { error: "jobId, crewId, category, and at least one file are required" },
        { status: 400 }
      );
    }

    // Verify job exists and get workspace_id
    const { data: job } = await supabase
      .from("jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (!job) {
      // Try roofing_jobs
      const { data: roofingJob } = await supabase
        .from("roofing_jobs")
        .select("workspace_id")
        .eq("id", jobId)
        .single();

      if (!roofingJob) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
    }

    const workspaceId = job?.workspace_id || (await supabase.from("roofing_jobs").select("workspace_id").eq("id", jobId).single()).data?.workspace_id;

    const uploadedPhotos = [];

    for (const file of files) {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `${workspaceId}/${jobId}/${category}/${fileName}`;

      // Convert file to array buffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("job-photos")
        .upload(storagePath, uint8Array, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        continue; // Skip this file but continue with others
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("job-photos")
        .getPublicUrl(storagePath);

      // Insert photo record
      const { data: photo, error: photoError } = await supabase
        .from("crew_photos")
        .insert({
          daily_log_id: dailyLogId || null,
          job_id: jobId,
          crew_id: crewId,
          photo_url: urlData.publicUrl,
          storage_path: storagePath,
          category: category,
          notes: notes || null,
        })
        .select()
        .single();

      if (photoError) {
        console.error("Error creating photo record:", photoError);
        // Clean up uploaded file
        await supabase.storage.from("job-photos").remove([storagePath]);
        continue;
      }

      uploadedPhotos.push({
        ...photo,
        url: urlData.publicUrl,
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
      message: `Successfully uploaded ${uploadedPhotos.length} photo(s)`,
    });
  } catch (error: any) {
    console.error("Upload photos error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























