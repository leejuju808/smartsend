// Block 24660 — SmartSend Roofing Document Vault v1
// API Route: Upload Job Document with AI Auto-Categorization
// POST /api/jobs/upload-document

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import {
  categorizeDocument,
  extractSearchText,
} from "@/lib/ai/documentCategorizer";
import { autoLinkDocument } from "@/lib/services/documentLinking";

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
    const job_id = formData.get("job_id") as string;
    const doc_type = (formData.get("doc_type") as string) || "other";
    const title = (formData.get("title") as string) || null;

    if (!file || !job_id) {
      return NextResponse.json(
        { error: "Missing file or job_id" },
        { status: 400 }
      );
    }

    // Validate job and get workspace_id + context for AI categorization
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, homeowner_name, carrier, claim_number")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const file_id = randomUUID();
    const path = `${job.workspace_id}/${job_id}/${file_id}.${ext}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("job-documents")
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    // AI Auto-Categorization (if doc_type is "other" or not provided)
    let finalDocType = doc_type;
    let categoryFolder: string | null = null;
    let autoCategorized = false;
    let categorizationConfidence = 0;
    let extractedData: Record<string, any> = {};
    let searchText = "";

    if (doc_type === "other" || !doc_type) {
      try {
        // Read file content preview for text-based files
        let contentPreview: string | undefined;
        if (file.type === "application/pdf" || file.type.startsWith("text/")) {
          const text = await file.text();
          contentPreview = text.substring(0, 2000); // First 2000 chars
        }

        const categorization = await categorizeDocument(
          file.name,
          file.type,
          contentPreview,
          {
            jobId: job_id,
            homeownerName: job.homeowner_name || undefined,
            claimNumber: job.claim_number || undefined,
            insuranceCarrier: job.carrier || undefined,
          }
        );

        finalDocType = categorization.doc_type;
        categoryFolder = categorization.category_folder;
        autoCategorized = true;
        categorizationConfidence = categorization.confidence;
        extractedData = categorization.extracted_data || {};
      } catch (error) {
        console.error("Error in auto-categorization:", error);
        // Continue with manual doc_type
      }
    }

    // Extract search text
    searchText = extractSearchText(file.name, title, extractedData);

    // Prepare metadata
    let metadata: Record<string, any> = {
      original_filename: file.name,
      ...extractedData,
    };
    if (finalDocType === "photo_before" || finalDocType === "photo_damage") {
      metadata.stage = "before";
    } else if (
      finalDocType === "photo_completed" ||
      finalDocType === "photo_after"
    ) {
      metadata.stage = "after";
    }

    // Insert DB record (store storage path, not URL - URLs will be signed on fetch)
    const { error: dbError, data: doc } = await supabase
      .from("job_documents")
      .insert({
        job_id,
        workspace_id: job.workspace_id,
        doc_type: finalDocType,
        category_folder: categoryFolder,
        title,
        file_url: path, // Store storage path, will generate signed URLs on fetch
        file_ext: ext,
        file_size: file.size,
        uploaded_by: user.id,
        metadata,
        auto_categorized,
        categorization_confidence: categorizationConfidence || null,
        search_text: searchText,
        extracted_data: extractedData,
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB error:", dbError);
      // Try to clean up uploaded file if DB insert fails
      await supabase.storage.from("job-documents").remove([path]);
      return NextResponse.json(
        { error: dbError.message },
        { status: 500 }
      );
    }

    // Auto-link document to other features (async, don't block response)
    if (doc) {
      autoLinkDocument(doc.id, job_id).catch((err) => {
        console.error("Error auto-linking document:", err);
        // Non-blocking error
      });
    }

    return NextResponse.json(
      { success: true, document: doc },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in upload document:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

