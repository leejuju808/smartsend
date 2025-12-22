// Block 17000 — PDF/Insurance Document Analysis API
// POST /api/files/analyze-pdf
// Extracts text and metadata from PDFs, especially insurance documents

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { logContactActivity } from "@/lib/contactActivity";

// Helper to get current org_id
async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { attachmentId } = body;

    if (!attachmentId) {
      return NextResponse.json({ error: "attachmentId is required" }, { status: 400 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get attachment details
    const { data: attachment, error: attachmentError } = await supabase
      .from("attachments")
      .select(`
        id,
        contact_id,
        org_id,
        file_name,
        file_type,
        storage_path
      `)
      .eq("id", attachmentId)
      .eq("org_id", orgId)
      .single();

    if (attachmentError || !attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Only analyze PDFs
    if (attachment.file_type !== "application/pdf") {
      return NextResponse.json({ error: "File is not a PDF" }, { status: 400 });
    }

    // Get signed URL for the PDF
    const { data: urlData } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.storage_path, 3600);

    if (!urlData?.signedUrl) {
      return NextResponse.json({ error: "Failed to generate PDF URL" }, { status: 500 });
    }

    // Extract text and analyze PDF
    const extractionResult = await extractPDFContent(urlData.signedUrl);

    // Check if this looks like an insurance document
    const isInsuranceDoc = checkIfInsuranceDocument(extractionResult.text);

    if (isInsuranceDoc) {
      // Extract insurance-specific data
      const insuranceData = extractInsuranceData(extractionResult.text, extractionResult.metadata);

      // Create insurance_docs record
      const { data: insuranceDoc, error: insuranceInsertError } = await supabase
        .from("insurance_docs")
        .insert({
          attachment_id: attachmentId,
          org_id: orgId,
          contact_id: attachment.contact_id,
          claim_number: insuranceData.claimNumber,
          deductible: insuranceData.deductible,
          acv: insuranceData.acv,
          rcv: insuranceData.rcv,
          adjuster_name: insuranceData.adjusterName,
          adjuster_phone: insuranceData.adjusterPhone,
          adjuster_email: insuranceData.adjusterEmail,
          inspection_date: insuranceData.inspectionDate,
          date_of_loss: insuranceData.dateOfLoss,
          carrier_name: insuranceData.carrierName,
          policy_number: insuranceData.policyNumber,
          extracted_metadata: extractionResult.metadata || {},
        })
        .select()
        .single();

      if (insuranceInsertError) {
        console.error("Error creating insurance doc:", insuranceInsertError);
        return NextResponse.json({ error: "Failed to save insurance document data" }, { status: 500 });
      }

      // Update attachment with insurance doc reference
      await supabase
        .from("attachments")
        .update({
          insurance_doc_id: insuranceDoc.id,
        })
        .eq("id", attachmentId);

      // Update contact with insurance information
      await updateContactWithInsuranceData(supabase, {
        contactId: attachment.contact_id,
        orgId,
        insuranceData,
      });

      // Log activity
      await logContactActivity({
        orgId,
        contactId: attachment.contact_id,
        type: "note_added",
        title: `Insurance document analyzed: ${insuranceData.carrierName || "Insurance document"}`,
        description: `Claim #: ${insuranceData.claimNumber || "N/A"} | Deductible: ${insuranceData.deductible ? `$${insuranceData.deductible}` : "N/A"} | ACV: ${insuranceData.acv ? `$${insuranceData.acv}` : "N/A"} | RCV: ${insuranceData.rcv ? `$${insuranceData.rcv}` : "N/A"}`,
        userId: user.id,
        meta: {
          attachment_id: attachmentId,
          insurance_doc_id: insuranceDoc.id,
          claim_number: insuranceData.claimNumber,
          event_type: "insurance_doc_analyzed",
        },
      });

      return NextResponse.json({
        success: true,
        type: "insurance_document",
        insurance_doc: insuranceDoc,
        extracted_data: insuranceData,
      });
    } else {
      // Regular PDF - extract quote amount if it's an estimate
      const quoteData = extractQuoteData(extractionResult.text);

      if (quoteData.quoteAmount) {
        // Update contact with quote amount
        await supabase
          .from("contacts")
          .update({
            quote_amount: quoteData.quoteAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", attachment.contact_id)
          .eq("org_id", orgId);

        // Update attachment linked_to
        await supabase
          .from("attachments")
          .update({
            linked_to: "estimate",
          })
          .eq("id", attachmentId);
      }

      return NextResponse.json({
        success: true,
        type: "regular_pdf",
        extracted_text: extractionResult.text.substring(0, 500), // First 500 chars
        quote_amount: quoteData.quoteAmount,
      });
    }
  } catch (error: any) {
    console.error("Error analyzing PDF:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Placeholder PDF extraction function - replace with actual PDF parsing service
async function extractPDFContent(pdfUrl: string): Promise<{
  text: string;
  metadata: Record<string, any>;
}> {
  // TODO: Replace with actual PDF extraction service (pdf-parse, pdf.js, etc.)
  // For now, return mock data
  
  // In production, use a PDF extraction library:
  // const pdfBuffer = await fetch(pdfUrl).then(r => r.arrayBuffer());
  // const pdfData = await pdfParse(Buffer.from(pdfBuffer));
  // return { text: pdfData.text, metadata: pdfData.metadata };

  return {
    text: "",
    metadata: {},
  };
}

// Check if PDF text contains insurance-related keywords
function checkIfInsuranceDocument(text: string): boolean {
  const insuranceKeywords = [
    "claim number",
    "claim #",
    "deductible",
    "actual cash value",
    "acv",
    "replacement cost value",
    "rcv",
    "adjuster",
    "carrier",
    "policy number",
    "date of loss",
    "inspection date",
    "insurance",
    "allstate",
    "state farm",
    "farmers",
    "usaa",
    "liberty mutual",
  ];

  const lowerText = text.toLowerCase();
  return insuranceKeywords.some((keyword) => lowerText.includes(keyword));
}

// Extract insurance-specific data from text
function extractInsuranceData(
  text: string,
  metadata: Record<string, any>
): {
  claimNumber: string | null;
  deductible: number | null;
  acv: number | null;
  rcv: number | null;
  adjusterName: string | null;
  adjusterPhone: string | null;
  adjusterEmail: string | null;
  inspectionDate: string | null;
  dateOfLoss: string | null;
  carrierName: string | null;
  policyNumber: string | null;
} {
  // TODO: Implement actual extraction logic using regex or NLP
  // This is a placeholder that should be replaced with real extraction

  const lowerText = text.toLowerCase();

  // Extract claim number (common patterns)
  const claimNumberMatch = text.match(/(?:claim\s*(?:number|#)?:?\s*)([A-Z0-9-]+)/i);
  const claimNumber = claimNumberMatch ? claimNumberMatch[1] : null;

  // Extract deductible (look for dollar amounts near "deductible")
  const deductibleMatch = text.match(/(?:deductible:?\s*\$?)([\d,]+\.?\d*)/i);
  const deductible = deductibleMatch ? parseFloat(deductibleMatch[1].replace(/,/g, "")) : null;

  // Extract ACV
  const acvMatch = text.match(/(?:actual\s*cash\s*value|acv):?\s*\$?([\d,]+\.?\d*)/i);
  const acv = acvMatch ? parseFloat(acvMatch[1].replace(/,/g, "")) : null;

  // Extract RCV
  const rcvMatch = text.match(/(?:replacement\s*cost\s*value|rcv):?\s*\$?([\d,]+\.?\d*)/i);
  const rcv = rcvMatch ? parseFloat(rcvMatch[1].replace(/,/g, "")) : null;

  // Extract adjuster name (look for "adjuster:" pattern)
  const adjusterMatch = text.match(/(?:adjuster:?\s*)([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
  const adjusterName = adjusterMatch ? adjusterMatch[1] : null;

  // Extract carrier name (common insurance companies)
  const carriers = ["allstate", "state farm", "farmers", "usaa", "liberty mutual", "progressive", "geico", "nationwide"];
  const carrierName = carriers.find((carrier) => lowerText.includes(carrier)) || null;

  return {
    claimNumber,
    deductible,
    acv,
    rcv,
    adjusterName,
    adjusterPhone: null, // Extract from text patterns
    adjusterEmail: null, // Extract from text patterns
    inspectionDate: null, // Extract date patterns
    dateOfLoss: null, // Extract date patterns
    carrierName,
    policyNumber: null, // Extract policy number patterns
  };
}

// Extract quote/estimate data from PDF
function extractQuoteData(text: string): {
  quoteAmount: number | null;
} {
  // Look for dollar amounts that might be quotes
  const quotePatterns = [
    /(?:total|amount|quote|estimate):?\s*\$?([\d,]+\.?\d*)/i,
    /\$([\d,]+\.?\d*)/g,
  ];

  let quoteAmount: number | null = null;

  for (const pattern of quotePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      // Take the largest amount found (likely the total)
      const amounts = matches
        .map((m) => parseFloat(m.replace(/[^0-9.]/g, "")))
        .filter((n) => !isNaN(n) && n > 100); // Filter out small amounts
      if (amounts.length > 0) {
        quoteAmount = Math.max(...amounts);
        break;
      }
    }
  }

  return { quoteAmount };
}

// Update contact with insurance data
async function updateContactWithInsuranceData(
  supabase: any,
  params: {
    contactId: string;
    orgId: string;
    insuranceData: ReturnType<typeof extractInsuranceData>;
  }
) {
  const { contactId, orgId, insuranceData } = params;

  // Update contact fields if they exist in your schema
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  // Update revenue estimate if ACV/RCV available
  if (insuranceData.acv || insuranceData.rcv) {
    updates.estimated_job_value = insuranceData.rcv || insuranceData.acv;
  }

  await supabase
    .from("contacts")
    .update(updates)
    .eq("id", contactId)
    .eq("org_id", orgId);
}
