// Block 222000 — SmartSend Insurance Scope Importer v1
// POST /api/insurance/upload
// Uploads Xactimate PDF and creates insurance_import record

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

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
    const company_id = formData.get("company_id") as string;
    const homeowner_id = formData.get("homeowner_id") as string | null;

    if (!file || !company_id) {
      return NextResponse.json(
        { error: "Missing required fields: file, company_id" },
        { status: 400 }
      );
    }

    // Validate file type (must be PDF)
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "File must be a PDF" },
        { status: 400 }
      );
    }

    // Verify user has access to company
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("id, owner_id")
      .eq("id", company_id)
      .eq("owner_id", user.id)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found or access denied" },
        { status: 403 }
      );
    }

    // Verify homeowner if provided
    if (homeowner_id) {
      const { data: homeowner, error: homeownerError } = await supabase
        .from("homeowners")
        .select("id")
        .eq("id", homeowner_id)
        .single();

      if (homeownerError || !homeowner) {
        return NextResponse.json(
          { error: "Homeowner not found" },
          { status: 404 }
        );
      }
    }

    // Upload file to storage
    const fileExt = file.name.split(".").pop() || "pdf";
    const fileName = `${company_id}/insurance-imports/${randomUUID()}-${Date.now()}.${fileExt}`;
    const fileBuffer = await file.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("insurance-scopes")
      .upload(fileName, fileBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Create insurance_import record
    const { data: insuranceImport, error: importError } = await supabase
      .from("insurance_imports")
      .insert({
        company_id,
        homeowner_id: homeowner_id || null,
        created_by: user.id,
        file_url: fileName,
        file_name: file.name,
        file_size_bytes: file.size,
        status: "uploaded",
      })
      .select()
      .single();

    if (importError) {
      console.error("Error creating insurance import:", importError);
      // Clean up uploaded file if DB insert fails
      await supabase.storage.from("insurance-scopes").remove([fileName]);
      return NextResponse.json(
        { error: "Failed to create import record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      import_id: insuranceImport.id,
      file_url: fileName,
      status: insuranceImport.status,
    });
  } catch (error: any) {
    console.error("Error in POST /api/insurance/upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























