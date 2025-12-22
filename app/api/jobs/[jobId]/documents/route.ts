// Block 22830 — SmartSend Roofing Document Delivery & E-Sign v1
// API Route: GET /api/jobs/[jobId]/documents
// Returns list of signable documents for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch documents
    const { data: documents, error } = await supabase
      .from("job_signable_documents")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Get signed PDF URLs for signed documents
    const documentsWithUrls = await Promise.all(
      (documents || []).map(async (doc) => {
        let pdfUrl = null;
        let signedPdfUrl = null;

        if (doc.storage_path) {
          const { data: urlData } = supabase.storage
            .from("documents-original")
            .getPublicUrl(doc.storage_path);
          pdfUrl = urlData.publicUrl;
        }

        if (doc.signed_storage_path) {
          const { data: signedUrlData } = supabase.storage
            .from("documents-signed")
            .getPublicUrl(doc.signed_storage_path);
          signedPdfUrl = signedUrlData.publicUrl;
        }

        return {
          ...doc,
          pdf_url: pdfUrl,
          signed_pdf_url: signedPdfUrl,
        };
      })
    );

    return NextResponse.json({ documents: documentsWithUrls });
  } catch (error: any) {
    console.error("Error in GET /api/jobs/[jobId]/documents:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
