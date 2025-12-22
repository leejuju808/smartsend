// Block 22830 — SmartSend Roofing Document Delivery & E-Sign v1
// API Route: POST /api/jobs/documents/upload
// Uploads a PDF document and creates a signable document record

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const jobId = formData.get("job_id") as string;
    const documentType = formData.get("document_type") as string;
    const signerEmail = formData.get("signer_email") as string | null;
    const signerName = formData.get("signer_name") as string | null;

    if (!file || !jobId || !documentType) {
      return NextResponse.json(
        { error: "Missing required fields: file, job_id, document_type" },
        { status: 400 }
      );
    }

    // Validate file type
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    // Get workspace_id from job
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    const workspaceId = job.workspace_id;

    // Upload file to storage
    const fileBuffer = await file.arrayBuffer();
    const fileName = `${workspaceId}/${jobId}/${Date.now()}-${file.name}`;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("documents-original")
      .upload(fileName, fileBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Create document record
    const { data: document, error: docError } = await supabaseAdmin
      .from("job_signable_documents")
      .insert({
        workspace_id: workspaceId,
        job_id: jobId,
        document_type: documentType,
        storage_path: fileName,
        signer_email: signerEmail || null,
        signer_name: signerName || null,
        status: "sent",
      })
      .select()
      .single();

    if (docError) {
      console.error("Error creating document record:", docError);
      // Clean up uploaded file if document creation fails
      await supabaseAdmin.storage
        .from("documents-original")
        .remove([fileName]);
      return NextResponse.json(
        { error: "Failed to create document record" },
        { status: 500 }
      );
    }

    // Optionally send to homeowner via edge function
    // This could be done automatically or via a separate action

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        document_type: document.document_type,
        status: document.status,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/jobs/documents/upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































