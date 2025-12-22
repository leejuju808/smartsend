// Block 27880 — SmartSend Roofing Crew Mobile Field App v1
// API Route: Upload job photo (get signed URL)
// POST /api/crew/upload-photo

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const job_id = formData.get("job_id") as string;
    const crew_id = formData.get("crew_id") as string;
    const category = formData.get("category") as string;
    const file = formData.get("file") as File;

    if (!job_id || !crew_id || !category || !file) {
      return NextResponse.json(
        { error: "job_id, crew_id, category, and file are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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

    // Create storage path
    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const storagePath = `${job.workspace_id}/${job_id}/${fileName}`;

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload directly to storage using service role
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

    // Get public URL for the uploaded file
    const { data: publicUrlData } = supabase.storage
      .from("job-photos")
      .getPublicUrl(storagePath);

    // Save photo reference
    const { data: photo, error: photoError } = await supabase
      .from("roofing_job_photos")
      .insert({
        job_id,
        crew_id,
        category,
        url: publicUrlData.publicUrl,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (photoError) {
      console.error("Error creating photo record:", photoError);
      // Clean up uploaded file if DB insert fails
      await supabase.storage.from("job-photos").remove([storagePath]);
      return NextResponse.json(
        { error: "Failed to create photo record", details: photoError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photo,
    });
  } catch (error: any) {
    console.error("Error in crew upload photo API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































