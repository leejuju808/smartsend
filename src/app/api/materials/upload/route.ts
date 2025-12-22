// POST /api/materials/upload - Upload material photo to storage

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const jobId = formData.get("job_id") as string;
    const photoType = formData.get("photo_type") as string; // "delivery" or "verification"

    if (!file || !jobId) {
      return NextResponse.json(
        { error: "file and job_id are required" },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = file.name.split(".").pop();
    const fileName = `${jobId}/${photoType || "delivery"}/${timestamp}.${fileExt}`;

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("material-photos")
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("material-photos")
      .getPublicUrl(fileName);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: fileName,
    });
  } catch (error: any) {
    console.error("Error in POST /api/materials/upload:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























