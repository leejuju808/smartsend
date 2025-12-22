// Block 222000 — SmartSend Insurance Scope Importer v1
// POST /api/insurance/parse
// Parses PDF to extract text and prepare for AI analysis

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const body = await req.json();
    const { import_id } = body;

    if (!import_id) {
      return NextResponse.json(
        { error: "Missing required field: import_id" },
        { status: 400 }
      );
    }

    // Get insurance import
    const { data: insuranceImport, error: importError } = await supabase
      .from("insurance_imports")
      .select("id, company_id, file_url, status")
      .eq("id", import_id)
      .single();

    if (importError || !insuranceImport) {
      return NextResponse.json(
        { error: "Insurance import not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("id, owner_id")
      .eq("id", insuranceImport.company_id)
      .eq("owner_id", user.id)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Update status to parsing
    await supabase
      .from("insurance_imports")
      .update({ status: "parsing" })
      .eq("id", import_id);

    // Download PDF from storage
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("insurance-scopes")
      .download(insuranceImport.file_url);

    if (downloadError || !pdfData) {
      await supabase
        .from("insurance_imports")
        .update({ 
          status: "error",
          error_message: "Failed to download PDF from storage"
        })
        .eq("id", import_id);
      
      return NextResponse.json(
        { error: "Failed to download PDF" },
        { status: 500 }
      );
    }

    // Convert PDF to base64 for OpenAI Vision API
    // For MVP, we'll convert the PDF to images
    // In production, you might want to use a dedicated PDF parsing service
    const arrayBuffer = await pdfData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:application/pdf;base64,${base64}`;

    // For now, we'll store the base64 and let the structure route handle the actual parsing
    // In production, you'd convert PDF pages to images here
    // This is a placeholder - the actual PDF to image conversion will happen in the structure route
    // or via an edge function that can handle PDF processing

    // Update with raw text placeholder (will be extracted in structure route)
    await supabase
      .from("insurance_imports")
      .update({ 
        status: "parsed", // Mark as parsed so structure route can process
        raw_text: "PDF ready for AI extraction" // Placeholder
      })
      .eq("id", import_id);

    return NextResponse.json({
      success: true,
      import_id,
      status: "parsed",
      message: "PDF ready for line item extraction",
    });
  } catch (error: any) {
    console.error("Error in POST /api/insurance/parse:", error);
    
    // Update status to error
    const body = await req.json().catch(() => ({}));
    if (body.import_id) {
      await createClient()
        .from("insurance_imports")
        .update({ 
          status: "error",
          error_message: error.message || "Parsing failed"
        })
        .eq("id", body.import_id);
    }
    
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























