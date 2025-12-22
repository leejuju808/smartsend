// Block 42000 — SmartSend Roofing Crew App v1
// API Route: Upload Photo
// POST /api/crew/photos/upload

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const job_id = formData.get("job_id") as string;
    const member_id = formData.get("member_id") as string;
    const category = (formData.get("category") as string) || "during";
    const file = formData.get("file") as File;

    if (!job_id || !member_id || !file) {
      return NextResponse.json(
        { error: "job_id, member_id, and file are required" },
        { status: 400 }
      );
    }

    if (!["before", "during", "after", "issue"].includes(category)) {
      return NextResponse.json(
        { error: "Invalid category. Must be: before, during, after, or issue" },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Upload to storage
    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const storagePath = `${job.workspace_id}/${job_id}/${category}/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("job-photos")
      .upload(storagePath, uint8Array, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file", details: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("job-photos")
      .getPublicUrl(storagePath);

    // Insert photo record
    const { data: photo, error: photoError } = await supabase
      .from("job_photos")
      .insert({
        job_id,
        member_id,
        category,
        url: urlData.publicUrl,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (photoError) {
      console.error("Error creating photo record:", photoError);
      // Clean up uploaded file
      await supabase.storage.from("job-photos").remove([storagePath]);
      return NextResponse.json(
        { error: "Failed to create photo record", details: photoError.message },
        { status: 500 }
      );
    }

    // Log activity
    await supabase
      .from("job_activity_log")
      .insert({
        job_id,
        member_id,
        type: "photo",
        payload: {
          photo_id: photo.id,
          category,
          url: urlData.publicUrl,
        },
      });

    return NextResponse.json({
      success: true,
      photo: {
        ...photo,
        url: urlData.publicUrl,
      },
    });
  } catch (error: any) {
    console.error("Error in upload photo API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































