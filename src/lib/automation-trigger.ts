// Block 232000 — Automation Trigger Helper
// Use this to trigger automations from event listeners across the platform

import { createClient } from "@/lib/supabase/server";
import { triggerAutomationsForEvent } from "./automation-engine";

/**
 * Trigger automations for a proposal viewed event
 * Call this when a proposal is viewed
 */
export async function triggerProposalViewed(
  roofingCompanyId: string,
  proposalId: string,
  leadId: string,
  jobValue?: number
): Promise<void> {
  const supabase = createClient();
  await triggerAutomationsForEvent(
    roofingCompanyId,
    "event",
    "proposal_viewed",
    {
      proposal_id: proposalId,
      lead_id: leadId,
      job_value: jobValue,
      roofing_company_id: roofingCompanyId,
    },
    "proposal",
    proposalId,
    supabase
  );
}

/**
 * Trigger automations for a contract signed event
 */
export async function triggerContractSigned(
  roofingCompanyId: string,
  contractId: string,
  jobId: string,
  jobValue?: number
): Promise<void> {
  const supabase = createClient();
  await triggerAutomationsForEvent(
    roofingCompanyId,
    "event",
    "contract_signed",
    {
      contract_id: contractId,
      job_id: jobId,
      job_value: jobValue,
      roofing_company_id: roofingCompanyId,
    },
    "contract",
    contractId,
    supabase
  );
}

/**
 * Trigger automations for a payment received event
 */
export async function triggerPaymentReceived(
  roofingCompanyId: string,
  paymentId: string,
  jobId: string,
  amount: number
): Promise<void> {
  const supabase = createClient();
  await triggerAutomationsForEvent(
    roofingCompanyId,
    "event",
    "payment_received",
    {
      payment_id: paymentId,
      job_id: jobId,
      amount,
      roofing_company_id: roofingCompanyId,
    },
    "payment",
    paymentId,
    supabase
  );
}

/**
 * Trigger automations for a job scheduled event
 */
export async function triggerJobScheduled(
  roofingCompanyId: string,
  jobId: string,
  scheduledDate: string
): Promise<void> {
  const supabase = createClient();
  await triggerAutomationsForEvent(
    roofingCompanyId,
    "event",
    "job_scheduled",
    {
      job_id: jobId,
      scheduled_date: scheduledDate,
      roofing_company_id: roofingCompanyId,
    },
    "job",
    jobId,
    supabase
  );
}

/**
 * Trigger automations for materials delivered event
 */
export async function triggerMaterialsDelivered(
  roofingCompanyId: string,
  jobId: string,
  orderId: string
): Promise<void> {
  const supabase = createClient();
  await triggerAutomationsForEvent(
    roofingCompanyId,
    "event",
    "materials_delivered",
    {
      job_id: jobId,
      order_id: orderId,
      roofing_company_id: roofingCompanyId,
    },
    "job",
    jobId,
    supabase
  );
}

/**
 * Trigger automations for crew started event
 */
export async function triggerCrewStarted(
  roofingCompanyId: string,
  jobId: string,
  crewId: string
): Promise<void> {
  const supabase = createClient();
  await triggerAutomationsForEvent(
    roofingCompanyId,
    "event",
    "crew_started",
    {
      job_id: jobId,
      crew_id: crewId,
      roofing_company_id: roofingCompanyId,
    },
    "job",
    jobId,
    supabase
  );
}

/**
 * Trigger automations for invoice unpaid event
 */
export async function triggerInvoiceUnpaid(
  roofingCompanyId: string,
  invoiceId: string,
  daysOverdue: number
): Promise<void> {
  const supabase = createClient();
  await triggerAutomationsForEvent(
    roofingCompanyId,
    "condition",
    `invoice_unpaid_${daysOverdue}_days`,
    {
      invoice_id: invoiceId,
      days_overdue: daysOverdue,
      roofing_company_id: roofingCompanyId,
    },
    "invoice",
    invoiceId,
    supabase
  );
}

/**
 * Trigger automations for safety incident event
 */
export async function triggerSafetyIncident(
  roofingCompanyId: string,
  incidentId: string,
  severity: string
): Promise<void> {
  const supabase = createClient();
  await triggerAutomationsForEvent(
    roofingCompanyId,
    "event",
    "safety_incident",
    {
      incident_id: incidentId,
      severity,
      roofing_company_id: roofingCompanyId,
    },
    "safety_incident",
    incidentId,
    supabase
  );
}

/**
 * Trigger automations for customer portal message event
 */
export async function triggerCustomerMessage(
  roofingCompanyId: string,
  messageId: string,
  jobId: string
): Promise<void> {
  const supabase = createClient();
  await triggerAutomationsForEvent(
    roofingCompanyId,
    "event",
    "customer_message",
    {
      message_id: messageId,
      job_id: jobId,
      roofing_company_id: roofingCompanyId,
    },
    "message",
    messageId,
    supabase
  );
}

























