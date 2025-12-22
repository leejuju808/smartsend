/**
 * Block 24660 — SmartSend Document Vault v1
 * AI Auto-Categorization Service
 * 
 * Automatically categorizes uploaded documents using AI
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type DocumentCategory =
  | "estimates"
  | "insurance"
  | "permits"
  | "photos"
  | "receipts"
  | "contracts"
  | "warranty"
  | "notes"
  | "other";

export type DocumentType =
  // Estimates & Proposals
  | "estimate_roofr"
  | "estimate_xactimate"
  | "estimate_smartsend"
  | "pricing_breakdown"
  | "proposal"
  // Insurance Documents
  | "insurance_claim_form"
  | "insurance_adjuster_summary"
  | "insurance_supplement"
  | "insurance_approval_letter"
  | "insurance_depreciation_statement"
  | "insurance_acv_rcv_calculation"
  | "insurance_scope_of_loss"
  | "insurance_check"
  // Permits & Municipal
  | "permit_city"
  | "permit_hoa_approval"
  | "permit_inspection_status"
  // Photos & Videos
  | "photo_before"
  | "photo_damage"
  | "photo_inspection"
  | "photo_crew_arrival"
  | "photo_progress"
  | "photo_completed"
  | "video_before"
  | "video_damage"
  | "video_progress"
  | "video_completed"
  // Material Receipts
  | "receipt_supplier"
  | "receipt_delivery_confirmation"
  | "receipt_supplemental"
  // Contracts & Signatures
  | "contract_signed"
  | "contract_digital_signature_log"
  // Warranty & Post-Job
  | "warranty_manufacturer"
  | "warranty_workmanship"
  | "warranty_completion_certificate"
  // Internal Office Notes
  | "note_job"
  | "note_todo"
  | "note_internal_message"
  // Legacy
  | "photo_after"
  | "contract"
  | "invoice"
  | "insurance"
  | "permit"
  | "receipt"
  | "material_list"
  | "other";

export interface CategorizationResult {
  doc_type: DocumentType;
  category_folder: DocumentCategory;
  confidence: number;
  extracted_data?: {
    claim_number?: string;
    insurance_carrier?: string;
    amount?: number;
    date?: string;
    permit_number?: string;
    supplier_name?: string;
    [key: string]: any;
  };
  reasoning?: string;
}

/**
 * Categorize a document based on filename, content, and context
 */
export async function categorizeDocument(
  filename: string,
  fileType: string,
  contentPreview?: string,
  context?: {
    jobId?: string;
    homeownerName?: string;
    claimNumber?: string;
    insuranceCarrier?: string;
  }
): Promise<CategorizationResult> {
  // Quick heuristic checks first (fast path)
  const heuristicResult = categorizeByHeuristics(filename, fileType, contentPreview);
  if (heuristicResult.confidence >= 0.85) {
    return heuristicResult;
  }

  // Use AI for ambiguous cases
  try {
    const systemPrompt = `You are SmartSend Document Vault AI - a document categorization system for roofing companies.

Your job is to categorize documents into the correct type and folder.

DOCUMENT TYPES:
- Estimates & Proposals: estimate_roofr, estimate_xactimate, estimate_smartsend, pricing_breakdown, proposal
- Insurance: insurance_claim_form, insurance_adjuster_summary, insurance_supplement, insurance_approval_letter, insurance_depreciation_statement, insurance_acv_rcv_calculation, insurance_scope_of_loss, insurance_check
- Permits: permit_city, permit_hoa_approval, permit_inspection_status
- Photos: photo_before, photo_damage, photo_inspection, photo_crew_arrival, photo_progress, photo_completed
- Videos: video_before, video_damage, video_progress, video_completed
- Receipts: receipt_supplier, receipt_delivery_confirmation, receipt_supplemental
- Contracts: contract_signed, contract_digital_signature_log
- Warranty: warranty_manufacturer, warranty_workmanship, warranty_completion_certificate
- Notes: note_job, note_todo, note_internal_message

CATEGORY FOLDERS (maps to doc_type):
- estimates: estimate_*, proposal, pricing_breakdown
- insurance: insurance_*
- permits: permit_*
- photos: photo_*, video_*
- receipts: receipt_*, invoice, material_list
- contracts: contract_*
- warranty: warranty_*
- notes: note_*
- other: everything else

EXTRACTION RULES:
- Extract claim numbers (format: usually alphanumeric, 8-12 chars)
- Extract insurance carrier names (State Farm, Allstate, USAA, etc.)
- Extract monetary amounts ($X,XXX.XX format)
- Extract dates (various formats)
- Extract permit numbers
- Extract supplier names

Return JSON with:
{
  "doc_type": "exact_type_from_list",
  "category_folder": "estimates|insurance|permits|photos|receipts|contracts|warranty|notes|other",
  "confidence": 0.0-1.0,
  "extracted_data": {
    "claim_number": "...",
    "insurance_carrier": "...",
    "amount": 12345.67,
    "date": "YYYY-MM-DD",
    "permit_number": "...",
    "supplier_name": "..."
  },
  "reasoning": "brief explanation"
}`;

    const userPrompt = `Categorize this document:

Filename: ${filename}
File Type: ${fileType}
${contentPreview ? `Content Preview: ${contentPreview.substring(0, 500)}` : ""}
${context?.claimNumber ? `Claim Number: ${context.claimNumber}` : ""}
${context?.insuranceCarrier ? `Insurance Carrier: ${context.insuranceCarrier}` : ""}
${context?.homeownerName ? `Homeowner: ${context.homeownerName}` : ""}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    return {
      doc_type: result.doc_type || "other",
      category_folder: result.category_folder || "other",
      confidence: result.confidence || 0.5,
      extracted_data: result.extracted_data || {},
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error("Error in AI categorization:", error);
    // Fallback to heuristic
    return categorizeByHeuristics(filename, fileType, contentPreview);
  }
}

/**
 * Fast heuristic-based categorization
 */
function categorizeByHeuristics(
  filename: string,
  fileType: string,
  contentPreview?: string
): CategorizationResult {
  const lowerFilename = filename.toLowerCase();
  const lowerContent = (contentPreview || "").toLowerCase();

  // Photo/Video detection
  if (
    fileType.startsWith("image/") ||
    lowerFilename.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i)
  ) {
    if (lowerFilename.includes("before") || lowerContent.includes("before")) {
      return {
        doc_type: "photo_before",
        category_folder: "photos",
        confidence: 0.9,
      };
    }
    if (lowerFilename.includes("after") || lowerContent.includes("after")) {
      return {
        doc_type: "photo_completed",
        category_folder: "photos",
        confidence: 0.9,
      };
    }
    if (
      lowerFilename.includes("damage") ||
      lowerContent.includes("damage") ||
      lowerContent.includes("leak")
    ) {
      return {
        doc_type: "photo_damage",
        category_folder: "photos",
        confidence: 0.85,
      };
    }
    return {
      doc_type: "photo_before",
      category_folder: "photos",
      confidence: 0.8,
    };
  }

  if (
    fileType.startsWith("video/") ||
    lowerFilename.match(/\.(mp4|mov|avi|mkv)$/i)
  ) {
    return {
      doc_type: "video_before",
      category_folder: "photos",
      confidence: 0.85,
    };
  }

  // Insurance documents
  if (
    lowerFilename.includes("adjuster") ||
    lowerFilename.includes("adjustment") ||
    lowerContent.includes("adjuster") ||
    lowerContent.includes("scope of loss")
  ) {
    return {
      doc_type: "insurance_adjuster_summary",
      category_folder: "insurance",
      confidence: 0.9,
    };
  }

  if (
    lowerFilename.includes("claim") ||
    lowerContent.includes("claim number") ||
    lowerContent.includes("claim #")
  ) {
    return {
      doc_type: "insurance_claim_form",
      category_folder: "insurance",
      confidence: 0.85,
    };
  }

  if (
    lowerFilename.includes("supplement") ||
    lowerContent.includes("supplement")
  ) {
    return {
      doc_type: "insurance_supplement",
      category_folder: "insurance",
      confidence: 0.9,
    };
  }

  if (
    lowerFilename.includes("acv") ||
    lowerFilename.includes("rcv") ||
    lowerContent.includes("actual cash value") ||
    lowerContent.includes("replacement cost value")
  ) {
    return {
      doc_type: "insurance_acv_rcv_calculation",
      category_folder: "insurance",
      confidence: 0.9,
    };
  }

  if (
    lowerFilename.includes("depreciation") ||
    lowerContent.includes("depreciation")
  ) {
    return {
      doc_type: "insurance_depreciation_statement",
      category_folder: "insurance",
      confidence: 0.9,
    };
  }

  // Permits
  if (
    lowerFilename.includes("permit") ||
    lowerContent.includes("permit") ||
    lowerContent.includes("municipal")
  ) {
    if (lowerFilename.includes("hoa") || lowerContent.includes("hoa")) {
      return {
        doc_type: "permit_hoa_approval",
        category_folder: "permits",
        confidence: 0.9,
      };
    }
    return {
      doc_type: "permit_city",
      category_folder: "permits",
      confidence: 0.85,
    };
  }

  // Estimates
  if (
    lowerFilename.includes("estimate") ||
    lowerFilename.includes("quote") ||
    lowerContent.includes("estimate") ||
    lowerContent.includes("quote")
  ) {
    if (lowerFilename.includes("roofr") || lowerContent.includes("roofr")) {
      return {
        doc_type: "estimate_roofr",
        category_folder: "estimates",
        confidence: 0.9,
      };
    }
    if (
      lowerFilename.includes("xactimate") ||
      lowerContent.includes("xactimate")
    ) {
      return {
        doc_type: "estimate_xactimate",
        category_folder: "estimates",
        confidence: 0.9,
      };
    }
    return {
      doc_type: "estimate_smartsend",
      category_folder: "estimates",
      confidence: 0.8,
    };
  }

  if (
    lowerFilename.includes("proposal") ||
    lowerContent.includes("proposal")
  ) {
    return {
      doc_type: "proposal",
      category_folder: "estimates",
      confidence: 0.85,
    };
  }

  // Contracts
  if (
    lowerFilename.includes("contract") ||
    lowerContent.includes("contract") ||
    lowerContent.includes("agreement")
  ) {
    return {
      doc_type: "contract_signed",
      category_folder: "contracts",
      confidence: 0.9,
    };
  }

  // Receipts
  if (
    lowerFilename.includes("receipt") ||
    lowerFilename.includes("invoice") ||
    lowerContent.includes("receipt") ||
    lowerContent.includes("invoice") ||
    lowerContent.includes("paid")
  ) {
    if (
      lowerFilename.includes("delivery") ||
      lowerContent.includes("delivery")
    ) {
      return {
        doc_type: "receipt_delivery_confirmation",
        category_folder: "receipts",
        confidence: 0.85,
      };
    }
    return {
      doc_type: "receipt_supplier",
      category_folder: "receipts",
      confidence: 0.8,
    };
  }

  // Warranty
  if (
    lowerFilename.includes("warranty") ||
    lowerContent.includes("warranty")
  ) {
    if (
      lowerFilename.includes("manufacturer") ||
      lowerContent.includes("manufacturer")
    ) {
      return {
        doc_type: "warranty_manufacturer",
        category_folder: "warranty",
        confidence: 0.9,
      };
    }
    return {
      doc_type: "warranty_workmanship",
      category_folder: "warranty",
      confidence: 0.8,
    };
  }

  // Default fallback
  return {
    doc_type: "other",
    category_folder: "other",
    confidence: 0.5,
  };
}

/**
 * Extract searchable text from document metadata
 */
export function extractSearchText(
  filename: string,
  title: string | null,
  extractedData: Record<string, any>
): string {
  const parts: string[] = [];

  if (filename) parts.push(filename);
  if (title) parts.push(title);
  if (extractedData.claim_number) parts.push(extractedData.claim_number);
  if (extractedData.insurance_carrier)
    parts.push(extractedData.insurance_carrier);
  if (extractedData.permit_number) parts.push(extractedData.permit_number);
  if (extractedData.supplier_name) parts.push(extractedData.supplier_name);

  return parts.join(" ").toLowerCase();
}






































