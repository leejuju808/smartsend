// Block 25540 — SmartSend Roofing Warranty & Document Vault v1
// API Route: Warranty Package Management
// GET/POST /api/jobs/[jobId]/warranty-package

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get warranty package for a job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job and verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get warranty package
    const { data: warrantyPackage, error: warrantyError } = await supabase
      .from("warranty_packages")
      .select(`
        *,
        manufacturer_warranty:job_documents!warranty_packages_manufacturer_warranty_document_id_fkey(
          id,
          title,
          file_url,
          uploaded_at
        ),
        workmanship_warranty:job_documents!warranty_packages_workmanship_warranty_document_id_fkey(
          id,
          title,
          file_url,
          uploaded_at
        ),
        material_list:job_documents!warranty_packages_material_list_document_id_fkey(
          id,
          title,
          file_url,
          uploaded_at
        )
      `)
      .eq("job_id", jobId)
      .single();

    if (warrantyError && warrantyError.code !== "PGRST116") {
      console.error("Error fetching warranty package:", warrantyError);
      return NextResponse.json(
        { error: warrantyError.message || "Failed to fetch warranty package" },
        { status: 500 }
      );
    }

    // Get before/after photos if warranty package exists
    let beforePhotos: any[] = [];
    let afterPhotos: any[] = [];

    if (warrantyPackage) {
      if (warrantyPackage.before_photos_document_ids?.length > 0) {
        const { data: beforePhotosData } = await supabase
          .from("job_documents")
          .select("id, title, file_url, uploaded_at")
          .in("id", warrantyPackage.before_photos_document_ids)
          .is("deleted_at", null);

        beforePhotos = beforePhotosData || [];
      }

      if (warrantyPackage.after_photos_document_ids?.length > 0) {
        const { data: afterPhotosData } = await supabase
          .from("job_documents")
          .select("id, title, file_url, uploaded_at")
          .in("id", warrantyPackage.after_photos_document_ids)
          .is("deleted_at", null);

        afterPhotos = afterPhotosData || [];
      }
    }

    return NextResponse.json({
      warrantyPackage: warrantyPackage || null,
      beforePhotos,
      afterPhotos,
    });
  } catch (error: any) {
    console.error("Error in GET warranty-package:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Generate or regenerate warranty package
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job and verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Generate comprehensive warranty package
    const { data: warrantyId, error: generateError } = await supabase.rpc(
      "generate_comprehensive_warranty_package",
      { p_job_id: jobId }
    );

    if (generateError) {
      console.error("Error generating warranty package:", generateError);
      return NextResponse.json(
        { error: generateError.message || "Failed to generate warranty package" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      warrantyId,
      message: "Warranty package generated successfully",
    });
  } catch (error: any) {
    console.error("Error in POST warranty-package:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































