// API endpoint for voicemail file upload
// Block 467 — AI Voice Steps v1

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const bodySchema = z.object({
  workspace_id: z.string().uuid(),
  brand_id: z.string().uuid().optional(),
  file_name: z.string(),
  file_url: z.string().url(), // Storage URL from Supabase Storage
  file_size: z.number().int().min(0).optional(),
  duration_seconds: z.number().int().min(0).optional(),
  mime_type: z.string().default("audio/mpeg"),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const {
      workspace_id,
      brand_id,
      file_name,
      file_url,
      file_size,
      duration_seconds,
      mime_type,
    } = bodySchema.parse(json);

    // Get current user ID from auth header
    const authHeader = req.headers.get("authorization");
    let uploaded_by: string | null = null;

    if (authHeader) {
      // Extract user ID from token (simplified - you may need to verify token)
      // For now, we'll use a service role approach
    }

    // Create voicemail upload record
    const { data: upload, error: uploadError } = await supabase
      .from("voicemail_uploads")
      .insert({
        workspace_id,
        brand_id,
        uploaded_by,
        file_name,
        file_url,
        file_size,
        duration_seconds,
        mime_type,
      })
      .select()
      .single();

    if (uploadError) {
      console.error("Error creating voicemail upload:", uploadError);
      return NextResponse.json(
        { error: "Failed to save voicemail upload" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      upload_id: upload.id,
      file_url: upload.file_url,
    });
  } catch (err: any) {
    console.error("Error uploading voicemail:", err);
    const msg =
      err?.issues?.[0]?.message ||
      err?.message ||
      "Failed to upload voicemail";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}



