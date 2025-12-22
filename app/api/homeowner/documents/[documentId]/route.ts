// Block 22830 — SmartSend Roofing Document Delivery & E-Sign v1
// API Route: GET /api/homeowner/documents/[documentId]
// Returns document data for homeowner portal (token-based access)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Token required" },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1️⃣ Verify portal token and get job_id
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("job_id, workspace_id")
      .eq("portal_token", token)
      .eq("is_enabled", true)
      .single();

    if (portalError || !portal) {
      return NextResponse.json(
        { error: "Invalid portal token" },
        { status: 401 }
      );
    }

    // 2️⃣ Fetch document
    const { data: document, error: docError } = await supabase
      .from("job_signable_documents")
      .select("*")
      .eq("id", documentId)
      .eq("job_id", portal.job_id)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // 3️⃣ Get PDF URL from storage
    let pdfUrl = null;
    if (document.storage_path) {
      const { data: urlData } = supabase.storage
        .from("documents-original")
        .getPublicUrl(document.storage_path);

      pdfUrl = urlData.publicUrl;
    }

    // 4️⃣ If signed, get signed PDF URL
    let signedPdfUrl = null;
    if (document.signed_storage_path) {
      const { data: signedUrlData } = supabase.storage
        .from("documents-signed")
        .getPublicUrl(document.signed_storage_path);

      signedPdfUrl = signedUrlData.publicUrl;
    }

    return NextResponse.json({
      id: document.id,
      document_type: document.document_type,
      status: document.status,
      pdf_url: pdfUrl,
      signed_pdf_url: signedPdfUrl,
      signer_email: document.signer_email,
      signed_at: document.signed_at,
    });
  } catch (error: any) {
    console.error("Error fetching document:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































