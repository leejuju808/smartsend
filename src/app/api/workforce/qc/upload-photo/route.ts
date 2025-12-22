// POST /api/workforce/qc/upload-photo - Upload QC photo

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const jobId = formData.get("jobId") as string;
    const itemId = formData.get("itemId") as string;

    if (!file || !jobId) {
      return NextResponse.json(
        { error: "Missing required fields: file, jobId" },
        { status: 400 }
      );
    }

    // Upload to Supabase storage
    const fileName = `qc-photos/${jobId}/${itemId || 'general'}/${Date.now()}-${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await serviceSupabase.storage
      .from("job-photos")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading photo:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload photo" },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = serviceSupabase.storage
      .from("job-photos")
      .getPublicUrl(fileName);

    return NextResponse.json({ photo_url: urlData.publicUrl });
  } catch (error: any) {
    console.error("Error in photo upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























