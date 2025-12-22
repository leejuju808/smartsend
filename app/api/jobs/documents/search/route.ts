// Block 25540 — SmartSend Roofing Warranty & Document Vault v1
// API Route: Document Search Engine
// GET /api/jobs/documents/search

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const query = searchParams.get("q") || "";
    const homeownerName = searchParams.get("homeowner_name");
    const address = searchParams.get("address");
    const jobNumber = searchParams.get("job_number");
    const insuranceCarrier = searchParams.get("insurance_carrier");
    const claimNumber = searchParams.get("claim_number");
    const shingleColor = searchParams.get("shingle_color");
    const crewName = searchParams.get("crew_name");
    const docType = searchParams.get("doc_type");
    const categoryFolder = searchParams.get("category_folder");
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Build query
    let searchQuery = supabase
      .from("document_search_index")
      .select(
        `
        *,
        document:job_documents(
          id,
          title,
          doc_type,
          category_folder,
          file_url,
          uploaded_at,
          metadata
        ),
        job:roofing_jobs(
          id,
          title,
          homeowner_name,
          address,
          status
        )
      `
      )
      .eq("workspace_id", workspaceId)
      .limit(limit);

    // Apply filters
    if (query) {
      // Full-text search
      searchQuery = searchQuery.textSearch("search_content", query, {
        type: "websearch",
      });
    }

    if (homeownerName) {
      searchQuery = searchQuery.ilike("homeowner_name", `%${homeownerName}%`);
    }

    if (address) {
      searchQuery = searchQuery.ilike("address", `%${address}%`);
    }

    if (jobNumber) {
      searchQuery = searchQuery.ilike("job_number", `%${jobNumber}%`);
    }

    if (insuranceCarrier) {
      searchQuery = searchQuery.ilike("insurance_carrier", `%${insuranceCarrier}%`);
    }

    if (claimNumber) {
      searchQuery = searchQuery.eq("claim_number", claimNumber);
    }

    if (shingleColor) {
      searchQuery = searchQuery.ilike("shingle_color", `%${shingleColor}%`);
    }

    if (crewName) {
      searchQuery = searchQuery.ilike("crew_name", `%${crewName}%`);
    }

    // Execute search
    const { data: results, error: searchError } = await searchQuery;

    if (searchError) {
      console.error("Error searching documents:", searchError);
      return NextResponse.json(
        { error: searchError.message || "Failed to search documents" },
        { status: 500 }
      );
    }

    // Filter by doc_type and category_folder if provided (post-query filter)
    let filteredResults = results || [];

    if (docType) {
      filteredResults = filteredResults.filter(
        (r: any) => r.document?.doc_type === docType
      );
    }

    if (categoryFolder) {
      filteredResults = filteredResults.filter(
        (r: any) => r.document?.category_folder === categoryFolder
      );
    }

    // Generate signed URLs for documents
    const documentsWithUrls = await Promise.all(
      filteredResults.map(async (result: any) => {
        if (result.document?.file_url) {
          const { data: urlData } = await supabase.storage
            .from("job-documents")
            .createSignedUrl(result.document.file_url, 3600); // 1 hour expiry

          return {
            ...result,
            document: {
              ...result.document,
              signed_url: urlData?.signedUrl || null,
            },
          };
        }
        return result;
      })
    );

    return NextResponse.json({
      results: documentsWithUrls,
      count: documentsWithUrls.length,
      query: {
        q: query,
        homeownerName,
        address,
        jobNumber,
        insuranceCarrier,
        claimNumber,
        shingleColor,
        crewName,
        docType,
        categoryFolder,
      },
    });
  } catch (error: any) {
    console.error("Error in GET documents/search:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































