// POST /api/workforce/qc/upload-signature - Upload signature image

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

    if (!file || !jobId) {
      return NextResponse.json(
        { error: "Missing required fields: file, jobId" },
        { status: 400 }
      );
    }

    // Upload to Supabase storage
    const fileName = `qc-signatures/${jobId}/${Date.now()}-${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await serviceSupabase.storage
      .from("documents")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading signature:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload signature" },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = serviceSupabase.storage
      .from("documents")
      .getPublicUrl(fileName);

    return NextResponse.json({ signature_url: urlData.publicUrl });
  } catch (error: any) {
    console.error("Error in signature upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























