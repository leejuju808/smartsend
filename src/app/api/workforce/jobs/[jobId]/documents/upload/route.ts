// POST /api/workforce/jobs/[jobId]/documents/upload - Upload document file

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { jobId } = await params;
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const docType = formData.get("doc_type") as string;
    const name = formData.get("name") as string || file.name;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this job" },
        { status: 403 }
      );
    }

    // Determine bucket based on doc_type
    const bucketMap: Record<string, string> = {
      contract: "contracts",
      change_order: "change-orders",
      permit: "permits",
      plan: "plans",
      inspection: "inspection-reports",
      photo: "photos",
      misc: "job-documents",
    };

    const bucket = bucketMap[docType] || "job-documents";

    // Generate storage path
    const fileExt = file.name.split(".").pop();
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 11);
    const fileName = `${jobId}/${timestamp}_${random}.${fileExt}`;
    const storagePath = `${companyId}/${fileName}`;

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, uint8Array, {
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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    // Get employee ID for uploaded_by
    let employeeId = null;
    const { data: employee } = await supabase
      .from("workforce_employees")
      .select("id")
      .eq("company_id", companyId)
      .limit(1)
      .single();
    
    employeeId = employee?.id || null;

    // Create document record
    const { data: document, error: docError } = await supabase
      .from("job_documents")
      .insert({
        job_id: jobId,
        company_id: companyId,
        doc_type: docType,
        name: name,
        file_url: urlData.publicUrl,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        photo_category: formData.get("photo_category") as string || null,
        description: formData.get("description") as string || null,
        uploaded_by: employeeId,
      })
      .select(`
        *,
        workforce_employees:uploaded_by (
          first_name,
          last_name
        )
      `)
      .single();

    if (docError) {
      console.error("Error creating document record:", docError);
      // Try to delete uploaded file
      await supabase.storage.from(bucket).remove([storagePath]);
      return NextResponse.json(
        { error: "Failed to create document record" },
        { status: 500 }
      );
    }

    return NextResponse.json({ document });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/jobs/[jobId]/documents/upload:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























