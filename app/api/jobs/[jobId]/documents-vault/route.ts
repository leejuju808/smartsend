// Block 24660 — SmartSend Roofing Document Vault v1
// API Route: GET /api/jobs/[jobId]/documents-vault
// Returns documents organized by folder with search and filtering

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
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

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get("search");
    const folder = searchParams.get("folder");
    const docType = searchParams.get("doc_type");

    // Build query
    let query = supabase
      .from("job_documents")
      .select(
        `
        *,
        uploaded_by_profile:profiles!job_documents_uploaded_by_fkey(id, full_name, email)
      `
      )
      .eq("job_id", jobId)
      .is("deleted_at", null) // Only non-deleted documents
      .order("uploaded_at", { ascending: false });

    // Apply filters
    if (folder) {
      query = query.eq("category_folder", folder);
    }
    if (docType) {
      query = query.eq("doc_type", docType);
    }
    if (search) {
      // Full-text search on search_text column
      query = query.or(
        `search_text.ilike.%${search}%,title.ilike.%${search}%,file_url.ilike.%${search}%`
      );
    }

    const { data: documents, error } = await query;

    if (error) {
      console.error("Error fetching documents:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Generate signed URLs for storage paths
    const documentsWithUrls = await Promise.all(
      (documents || []).map(async (doc) => {
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(doc.file_url, 3600); // 1 hour expiry

        return {
          ...doc,
          signed_url: urlData?.signedUrl || null,
        };
      })
    );

    // Group by folder for response
    const groupedByFolder: Record<string, typeof documentsWithUrls> = {};
    documentsWithUrls.forEach((doc) => {
      const folder = doc.category_folder || "other";
      if (!groupedByFolder[folder]) {
        groupedByFolder[folder] = [];
      }
      groupedByFolder[folder].push(doc);
    });

    return NextResponse.json({
      documents: documentsWithUrls,
      groupedByFolder,
      total: documentsWithUrls.length,
    });
  } catch (error: any) {
    console.error("Error in GET /api/jobs/[jobId]/documents-vault:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































