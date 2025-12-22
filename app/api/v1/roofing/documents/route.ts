// GET /v1/roofing/documents - List documents
// POST /v1/roofing/documents - Upload document metadata

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

// GET list documents
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = req.nextUrl;
  const job_id = searchParams.get("job_id");
  const lead_id = searchParams.get("lead_id");
  const document_type = searchParams.get("type");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // Query documents table (if exists)
  // For now, return structure that matches expected format
  let query = supabase
    .from("documents")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (job_id) {
    query = query.eq("job_id", job_id);
  }

  if (lead_id) {
    query = query.eq("lead_id", lead_id);
  }

  if (document_type) {
    query = query.eq("document_type", document_type);
  }

  const { data: documents, error } = await query;

  if (error && error.code !== "PGRST116") {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: documents || [],
    pagination: {
      limit,
      offset,
      count: documents?.length || 0,
    },
  });
});

// POST upload document metadata
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const {
    job_id,
    lead_id,
    document_type,
    file_url,
    file_name,
    file_size,
    mime_type,
    metadata,
    ...otherFields
  } = body;

  if (!file_url || !document_type) {
    throw new ApiError("400_INVALID_BODY", "file_url and document_type are required");
  }

  if (!job_id && !lead_id) {
    throw new ApiError("400_INVALID_BODY", "job_id or lead_id is required");
  }

  const documentData = {
    workspace_id: auth.workspaceId,
    job_id,
    lead_id,
    document_type,
    file_url,
    file_name,
    file_size,
    mime_type,
    metadata: metadata || {},
    uploaded_at: new Date().toISOString(),
    ...otherFields,
  };

  // Insert into documents table
  const { data: document, error } = await supabase
    .from("documents")
    .insert(documentData)
    .select()
    .single();

  if (error && error.code !== "PGRST116") {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data: document || documentData }, { status: 201 });
});




































