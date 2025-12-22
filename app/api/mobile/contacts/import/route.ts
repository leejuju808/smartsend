import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/mobile/contacts/import
 * Process business card image and extract contact info
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Convert file to base64 for OCR API
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    // Call OCR service (using OpenAI Vision API or similar)
    // For now, we'll use a simple text extraction approach
    // In production, use Google Cloud Vision API, AWS Textract, or similar

    // Simulate OCR extraction (replace with actual OCR service)
    const extracted = await extractContactInfo(base64);

    if (!extracted.email && !extracted.phone) {
      return NextResponse.json(
        { error: "Could not extract contact information from image" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Create contact
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        workspace_id,
        email: extracted.email || `imported-${Date.now()}@example.com`,
        first_name: extracted.name?.split(" ")[0] || null,
        last_name: extracted.name?.split(" ").slice(1).join(" ") || null,
        phone: extracted.phone || null,
        lead_status: "new",
      })
      .select()
      .single();

    if (contactError) {
      return NextResponse.json(
        { error: "Failed to create contact", details: contactError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      contact_id: contact.id,
      extracted,
    });
  } catch (error: any) {
    console.error("Error importing contact:", error);
    return NextResponse.json(
      { error: "Failed to import contact" },
      { status: 500 }
    );
  }
}

/**
 * Extract contact info from image using OCR
 * Replace this with actual OCR service integration
 */
async function extractContactInfo(imageBase64: string): Promise<{
  name?: string;
  email?: string;
  phone?: string;
}> {
  // TODO: Integrate with OCR service (Google Cloud Vision, AWS Textract, etc.)
  // For now, return mock data
  // In production, use:
  // - Google Cloud Vision API
  // - AWS Textract
  // - Tesseract.js with preprocessing
  // - OpenAI Vision API

  return {
    name: "John Doe",
    email: "john@example.com",
    phone: "+1 (555) 123-4567",
  };
}






































