/**
 * Block 24660 — SmartSend Document Vault v1
 * Document Linking Service
 * 
 * Automatically links documents to other SmartSend features:
 * - Insurance Flow
 * - Payment tracking
 * - Job Health Score
 * - Supplier tracking
 * - Quote Follow-Up
 */

import { createClient } from "@/lib/supabase/server";

export interface DocumentLink {
  documentId: string;
  jobId: string;
  linkType:
    | "insurance_flow"
    | "payment_tracking"
    | "job_health"
    | "supplier_tracking"
    | "quote_followup";
  linkedEntityId?: string; // e.g., insurance_event_id, payment_id, etc.
  metadata?: Record<string, any>;
}

/**
 * Link a document to Insurance Flow
 */
export async function linkDocumentToInsuranceFlow(
  documentId: string,
  jobId: string,
  insuranceEventId?: string
): Promise<void> {
  const supabase = createClient();

  // Get current metadata
  const { data: currentDoc } = await supabase
    .from("job_documents")
    .select("metadata")
    .eq("id", documentId)
    .single();

  const updatedMetadata = {
    ...(currentDoc?.metadata || {}),
    insurance_event_id: insuranceEventId || null,
  };

  await supabase
    .from("job_documents")
    .update({
      linked_to_insurance_flow: true,
      metadata: updatedMetadata,
    })
    .eq("id", documentId);

  // Get workspace_id for logging
  const { data: doc } = await supabase
    .from("job_documents")
    .select("workspace_id")
    .eq("id", documentId)
    .single();

  // Log the link
  if (doc?.workspace_id) {
    await supabase.from("job_document_history").insert({
      document_id: documentId,
      job_id: jobId,
      workspace_id: doc.workspace_id,
      action: "linked",
      new_values: {
        link_type: "insurance_flow",
        insurance_event_id: insuranceEventId,
      },
    });
  }
}

/**
 * Link a document to Payment Tracking
 */
export async function linkDocumentToPaymentTracking(
  documentId: string,
  jobId: string,
  paymentId?: string
): Promise<void> {
  const supabase = createClient();

  // Get current metadata
  const { data: currentDoc } = await supabase
    .from("job_documents")
    .select("metadata")
    .eq("id", documentId)
    .single();

  const updatedMetadata = {
    ...(currentDoc?.metadata || {}),
    payment_id: paymentId || null,
  };

  await supabase
    .from("job_documents")
    .update({
      linked_to_payment_tracking: true,
      metadata: updatedMetadata,
    })
    .eq("id", documentId);

  // Get workspace_id for logging
  const { data: doc } = await supabase
    .from("job_documents")
    .select("workspace_id")
    .eq("id", documentId)
    .single();

  // Log the link
  if (doc?.workspace_id) {
    await supabase.from("job_document_history").insert({
      document_id: documentId,
      job_id: jobId,
      workspace_id: doc.workspace_id,
      action: "linked",
      new_values: {
        link_type: "payment_tracking",
        payment_id: paymentId,
      },
    });
  }
}

/**
 * Auto-link documents based on their type and extracted data
 */
export async function autoLinkDocument(
  documentId: string,
  jobId: string
): Promise<void> {
  const supabase = createClient();

  // Get document details
  const { data: doc } = await supabase
    .from("job_documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (!doc) return;

  const docType = doc.doc_type;
  const extractedData = doc.extracted_data || {};

  // Link insurance documents to Insurance Flow
  if (docType?.startsWith("insurance_")) {
    await linkDocumentToInsuranceFlow(documentId, jobId);

    // If document has claim number, try to find matching insurance event
    if (extractedData.claim_number) {
      const { data: insuranceEvent } = await supabase
        .from("insurance_events")
        .select("id")
        .eq("job_id", jobId)
        .ilike("claim_number", extractedData.claim_number)
        .limit(1)
        .single();

      if (insuranceEvent) {
        await linkDocumentToInsuranceFlow(
          documentId,
          jobId,
          insuranceEvent.id
        );
      }
    }
  }

  // Link receipt/invoice documents to Payment Tracking
  if (
    docType?.startsWith("receipt_") ||
    docType === "invoice" ||
    extractedData.amount
  ) {
    await linkDocumentToPaymentTracking(documentId, jobId);

    // If document has amount, try to match with payment
    if (extractedData.amount) {
      const { data: payment } = await supabase
        .from("job_payments")
        .select("id")
        .eq("job_id", jobId)
        .eq("amount", extractedData.amount)
        .limit(1)
        .single();

      if (payment) {
        await linkDocumentToPaymentTracking(
          documentId,
          jobId,
          payment.id
        );
      }
    }
  }

  // Link warranty documents to Job Health (triggers annual check-in)
  if (docType?.startsWith("warranty_")) {
    await supabase
      .from("job_documents")
      .update({
        linked_to_job_health: true,
      })
      .eq("id", documentId);
  }
}

/**
 * Get all documents linked to a specific feature
 */
export async function getLinkedDocuments(
  jobId: string,
  linkType: DocumentLink["linkType"]
): Promise<any[]> {
  const supabase = createClient();

  const columnMap: Record<DocumentLink["linkType"], string> = {
    insurance_flow: "linked_to_insurance_flow",
    payment_tracking: "linked_to_payment_tracking",
    job_health: "linked_to_job_health",
    supplier_tracking: "linked_to_supplier_tracking",
    quote_followup: "linked_to_quote_followup",
  };

  const { data } = await supabase
    .from("job_documents")
    .select("*")
    .eq("job_id", jobId)
    .eq(columnMap[linkType], true)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  return data || [];
}

