// Block 25900 — SmartSend Roof Measurement Integrations v1
// API Route: POST /api/measurements/upload
// Uploads measurement files (EagleView PDF, HOVER report, Drone photos/videos, Blueprints)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

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

    const file = formData.get("file") as File;
    const workspace_id = formData.get("workspace_id") as string;
    const job_id = formData.get("job_id") as string | null;
    const lead_id = formData.get("lead_id") as string | null;
    const source_type = formData.get("source_type") as string; // 'eagleview', 'hover', 'drone', 'blueprint'
    const source_name = formData.get("source_name") as string | null;
    const source_id = formData.get("source_id") as string | null;
    const import_method = formData.get("import_method") as string | null; // 'api', 'pdf_upload', 'email_attachment', 'manual_upload'

    if (!file || !workspace_id || !source_type) {
      return NextResponse.json(
        { error: "Missing required fields: file, workspace_id, source_type" },
        { status: 400 }
      );
    }

    // Validate source_type
    const validSourceTypes = ['eagleview', 'hover', 'drone', 'blueprint', 'manual', 'ai_photo_analysis'];
    if (!validSourceTypes.includes(source_type)) {
      return NextResponse.json(
        { error: `Invalid source_type. Must be one of: ${validSourceTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
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

    // Determine file type
    const fileType = file.type.startsWith('image/') ? 'image' : 
                     file.type.startsWith('video/') ? 'video' :
                     file.type === 'application/pdf' ? 'pdf' : 'other';

    // Upload file to storage
    const fileExt = file.name.split('.').pop() || 'bin';
    const fileName = `${workspace_id}/measurements/${randomUUID()}-${Date.now()}.${fileExt}`;
    const fileBuffer = await file.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("job-documents")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Create measurement source record
    const { data: measurementSource, error: sourceError } = await supabase
      .from("measurement_sources")
      .insert({
        workspace_id,
        job_id: job_id || null,
        lead_id: lead_id || null,
        source_type,
        source_name: source_name || file.name,
        source_id: source_id || null,
        file_url: fileName,
        file_type: fileType,
        file_size_bytes: file.size,
        import_method: import_method || 'manual_upload',
        imported_by: user.id,
        processing_status: 'pending',
        metadata: {
          original_filename: file.name,
          content_type: file.type,
        },
      })
      .select()
      .single();

    if (sourceError) {
      console.error("Error creating measurement source:", sourceError);
      // Clean up uploaded file if source creation fails
      await supabase.storage.from("job-documents").remove([fileName]);
      return NextResponse.json(
        { error: "Failed to create measurement source record" },
        { status: 500 }
      );
    }

    // Create job document record for easy access
    if (job_id) {
      const docTypeMap: Record<string, string> = {
        'eagleview': 'eagleview_report',
        'hover': 'hover_report',
        'drone': fileType === 'video' ? 'drone_video' : 'drone_photo',
        'blueprint': 'blueprint',
        'manual': 'measurement_report',
      };

      await supabase
        .from("job_documents")
        .insert({
          job_id,
          workspace_id,
          doc_type: docTypeMap[source_type] || 'measurement_report',
          title: source_name || file.name,
          file_url: fileName,
          file_ext: fileExt,
          file_size: file.size,
          uploaded_by: user.id,
          measurement_source_id: measurementSource.id,
          metadata: {
            source_type,
            source_id,
          },
        });
    }

    // TODO: Trigger background processing job for PDF parsing (EagleView, HOVER, Blueprint)
    // This would call an edge function or background job to parse the PDF and extract measurement data

    return NextResponse.json({
      success: true,
      measurement_source: {
        id: measurementSource.id,
        source_type: measurementSource.source_type,
        processing_status: measurementSource.processing_status,
        file_url: fileName,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/measurements/upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































