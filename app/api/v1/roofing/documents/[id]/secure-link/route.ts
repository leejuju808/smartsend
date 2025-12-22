// GET /v1/roofing/documents/:id/secure-link - Get secure link to document

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (
  req: NextRequest,
  auth,
  { params }: { params: { id: string } }
) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get document
  const { data: document, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (error || !document) {
    throw new ApiError("404_NOT_FOUND", "Document not found", 404);
  }

  // Generate secure signed URL (expires in 1 hour)
  // In production, use Supabase Storage signed URLs
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  
  // For now, return the file_url with expiration info
  // In production, generate actual signed URL
  const secureLink = {
    document_id: document.id,
    file_url: document.file_url,
    secure_url: document.file_url, // Replace with actual signed URL
    expires_at: expiresAt,
    file_name: document.file_name,
    file_size: document.file_size,
    mime_type: document.mime_type,
  };

  return NextResponse.json({ data: secureLink });
});




































