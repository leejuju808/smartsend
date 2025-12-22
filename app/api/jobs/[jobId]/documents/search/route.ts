// Block 24660 — SmartSend Roofing Document Vault v1
// API Route: POST /api/jobs/[jobId]/documents/search
// Advanced search across all documents

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      query,
      folder,
      docType,
      dateFrom,
      dateTo,
      uploadedBy,
      hasExtractedData,
    } = body;

    // Build query
    let dbQuery = supabase
      .from("job_documents")
      .select(
        `
        *,
        uploaded_by_profile:profiles!job_documents_uploaded_by_fkey(id, full_name, email)
      `
      )
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false });

    // Text search
    if (query) {
      dbQuery = dbQuery.or(
        `search_text.ilike.%${query}%,title.ilike.%${query}%,file_url.ilike.%${query}%`
      );
    }

    // Filters
    if (folder) {
      dbQuery = dbQuery.eq("category_folder", folder);
    }
    if (docType) {
      dbQuery = dbQuery.eq("doc_type", docType);
    }
    if (dateFrom) {
      dbQuery = dbQuery.gte("uploaded_at", dateFrom);
    }
    if (dateTo) {
      dbQuery = dbQuery.lte("uploaded_at", dateTo);
    }
    if (uploadedBy) {
      dbQuery = dbQuery.eq("uploaded_by", uploadedBy);
    }
    if (hasExtractedData) {
      dbQuery = dbQuery.not("extracted_data", "eq", "{}");
    }

    const { data: documents, error } = await dbQuery;

    if (error) {
      console.error("Error searching documents:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Generate signed URLs
    const documentsWithUrls = await Promise.all(
      (documents || []).map(async (doc) => {
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(doc.file_url, 3600);

        return {
          ...doc,
          signed_url: urlData?.signedUrl || null,
        };
      })
    );

    return NextResponse.json({
      results: documentsWithUrls,
      count: documentsWithUrls.length,
    });
  } catch (error: any) {
    console.error("Error in POST /api/jobs/[jobId]/documents/search:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































