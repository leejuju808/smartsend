// Block 22750 — SmartSend Roofing Field App v1
// API Route: Upload Field Photos
// POST /api/field/photos

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
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
    const workspace_id = formData.get("workspace_id") as string;
    const field_session_id = formData.get("field_session_id") as string | null;
    const crew_id = formData.get("crew_id") as string | null;
    const tag = (formData.get("tag") as string) || "during";
    const caption = formData.get("caption") as string | null;
    const files = formData.getAll("files") as File[];

    if (!job_id || !workspace_id || files.length === 0) {
      return NextResponse.json(
        { error: "job_id, workspace_id, and at least one file required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const uploadedPhotos = [];

    // Upload each file to Supabase Storage
    for (const file of files) {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `${workspace_id}/${job_id}/${field_session_id || "unsessioned"}/${fileName}`;

      // Convert file to array buffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("field-photos")
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
        .from("field-photos")
        .getPublicUrl(storagePath);

      // Insert photo record
      const { data: photo, error: photoError } = await supabase
        .from("job_field_photos")
        .insert({
          workspace_id,
          job_id,
          field_session_id: field_session_id || null,
          crew_id: crew_id || null,
          user_id: user.id,
          storage_path: storagePath,
          tag: tag as any,
          caption: caption || null,
        })
        .select()
        .single();

      if (photoError) {
        console.error("Error creating photo record:", photoError);
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

    return NextResponse.json(
      { photos: uploadedPhotos, message: `Uploaded ${uploadedPhotos.length} photo(s)` },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in field photos API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































