/**
 * Block 24660 — SmartSend Document Vault v1
 * Pipeline Document Requirements
 * 
 * Defines required documents for each pipeline stage and checks if they exist
 */

import { createClient } from "@/lib/supabase/server";

export type PipelineStage =
  | "NEW_LEAD"
  | "INSPECTION_SCHEDULED"
  | "INSPECTION_COMPLETE"
  | "QUOTE_SENT"
  | "APPROVED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "INSTALLED"
  | "COMPLETED";

export interface DocumentRequirement {
  docType: string;
  categoryFolder: string;
  required: boolean;
  description: string;
}

export const PIPELINE_DOCUMENT_REQUIREMENTS: Record<
  PipelineStage,
  DocumentRequirement[]
> = {
  NEW_LEAD: [],
  INSPECTION_SCHEDULED: [],
  INSPECTION_COMPLETE: [
    {
      docType: "photo_before",
      categoryFolder: "photos",
      required: true,
      description: "Before photos documenting damage",
    },
    {
      docType: "photo_damage",
      categoryFolder: "photos",
      required: true,
      description: "Damage documentation photos",
    },
  ],
  QUOTE_SENT: [
    {
      docType: "estimate_smartsend",
      categoryFolder: "estimates",
      required: true,
      description: "Estimate/proposal document",
    },
  ],
  APPROVED: [
    {
      docType: "contract_signed",
      categoryFolder: "contracts",
      required: true,
      description: "Signed contract",
    },
  ],
  SCHEDULED: [
    {
      docType: "permit_city",
      categoryFolder: "permits",
      required: false,
      description: "City roofing permit (if required)",
    },
    {
      docType: "permit_hoa_approval",
      categoryFolder: "permits",
      required: false,
      description: "HOA approval (if required)",
    },
  ],
  IN_PROGRESS: [
    {
      docType: "photo_progress",
      categoryFolder: "photos",
      required: false,
      description: "Progress photos",
    },
  ],
  INSTALLED: [
    {
      docType: "photo_completed",
      categoryFolder: "photos",
      required: true,
      description: "Completed roof photos",
    },
    {
      docType: "warranty_manufacturer",
      categoryFolder: "warranty",
      required: true,
      description: "Manufacturer warranty",
    },
    {
      docType: "warranty_workmanship",
      categoryFolder: "warranty",
      required: true,
      description: "Workmanship warranty",
    },
  ],
  COMPLETED: [
    {
      docType: "warranty_completion_certificate",
      categoryFolder: "warranty",
      required: false,
      description: "Completion certificate",
    },
  ],
};

/**
 * Check if a job has all required documents for its current stage
 */
export async function checkPipelineDocumentRequirements(
  jobId: string,
  currentStage: PipelineStage
): Promise<{
  hasAllRequired: boolean;
  missing: DocumentRequirement[];
  present: DocumentRequirement[];
}> {
  const supabase = createClient();

  const requirements = PIPELINE_DOCUMENT_REQUIREMENTS[currentStage] || [];

  if (requirements.length === 0) {
    return {
      hasAllRequired: true,
      missing: [],
      present: [],
    };
  }

  // Get all documents for this job
  const { data: documents } = await supabase
    .from("job_documents")
    .select("doc_type, category_folder")
    .eq("job_id", jobId)
    .is("deleted_at", null);

  const docTypes = new Set(
    (documents || []).map((d) => `${d.doc_type}|${d.category_folder}`)
  );

  const missing: DocumentRequirement[] = [];
  const present: DocumentRequirement[] = [];

  requirements.forEach((req) => {
    const key = `${req.docType}|${req.categoryFolder}`;
    if (docTypes.has(key)) {
      present.push(req);
    } else if (req.required) {
      missing.push(req);
    }
  });

  return {
    hasAllRequired: missing.length === 0,
    missing,
    present,
  };
}

/**
 * Get document requirement status for a job
 */
export async function getDocumentRequirementStatus(jobId: string) {
  const supabase = createClient();

  // Get job's current stage
  const { data: job } = await supabase
    .from("roofing_jobs")
    .select("current_stage")
    .eq("id", jobId)
    .single();

  if (!job) {
    return null;
  }

  return checkPipelineDocumentRequirements(
    jobId,
    job.current_stage as PipelineStage
  );
}






































