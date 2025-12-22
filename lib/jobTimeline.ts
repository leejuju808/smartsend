// Block 24620 — SmartSend Roofing Job Timeline v2 Helper Functions
// Utility functions to log timeline events for the 10 event types

import { createClient } from "@/lib/supabase/server";

export type TimelineEventType =
  // Event Type 1 — Homeowner Communication
  | "homeowner_message_inbound"
  | "homeowner_message_outbound"
  | "homeowner_confirmation"
  | "homeowner_question"
  | "homeowner_objection"
  | "followup_sequence_sent"
  // Event Type 2 — Crew Actions
  | "crew_assigned"
  | "crew_on_way"
  | "crew_arrived"
  | "crew_note"
  | "crew_issue_reported"
  | "crew_photo_uploaded"
  | "crew_job_completed"
  // Event Type 3 — Supplier Actions
  | "supplier_po_sent"
  | "supplier_confirmed"
  | "supplier_delivery_scheduled"
  | "supplier_delivery_failed"
  | "supplier_supplemental_order"
  | "supplier_correction_delivered"
  // Event Type 4 — Material Events
  | "material_takeoff_created"
  | "material_po_created"
  | "material_confirmation"
  | "material_issue_logged"
  | "material_shortage_alert"
  // Event Type 5 — Insurance Events
  | "insurance_claim_filed"
  | "insurance_adjuster_assigned"
  | "insurance_adjuster_inspection"
  | "insurance_acv_received"
  | "insurance_supplement_submitted"
  | "insurance_supplement_approved"
  | "insurance_depreciation_received"
  // Event Type 6 — Payment Events
  | "payment_deposit_invoice_sent"
  | "payment_deposit_collected"
  | "payment_final_invoice_sent"
  | "payment_final_collected"
  | "payment_insurance_recorded"
  | "payment_overdue_alert"
  // Event Type 7 — Scheduling Events
  | "scheduling_inspection_scheduled"
  | "scheduling_installation_scheduled"
  | "scheduling_rescheduled"
  | "scheduling_weather_delay"
  | "scheduling_homeowner_request"
  // Event Type 8 — Weather Events
  | "weather_alert"
  | "weather_hail_impact"
  | "weather_wind_risk"
  | "weather_job_day_change"
  // Event Type 9 — Internal Notes
  | "internal_note"
  | "internal_crew_note"
  | "internal_homeowner_behavior"
  | "internal_material_reminder"
  | "internal_quality_control"
  // Event Type 10 — Status Changes
  | "status_lead_in"
  | "status_inspection"
  | "status_quote_sent"
  | "status_approved"
  | "status_scheduled"
  | "status_installed"
  | "status_completed"
  | "status_cancelled";

export interface LogTimelineEventParams {
  jobId?: string;
  leadId?: string;
  eventType: TimelineEventType;
  eventSubtype?: string;
  message?: string;
  eventData?: Record<string, any>;
  userId?: string;
}

/**
 * Log a timeline event for a roofing job
 * This is the main function to use when logging any job timeline event
 */
export async function logJobTimelineEvent(
  params: LogTimelineEventParams
): Promise<string | null> {
  try {
    const supabase = createClient();

    // Get current user if userId not provided
    let userId = params.userId;
    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id;
    }

    // Call the database function to log the event
    const { data, error } = await supabase.rpc("log_job_timeline_event", {
      p_job_id: params.jobId || null,
      p_lead_id: params.leadId || null,
      p_event_type: params.eventType,
      p_event_subtype: params.eventSubtype || null,
      p_message: params.message || null,
      p_event_data: params.eventData || {},
      p_user_id: userId || null,
    });

    if (error) {
      console.error("Error logging timeline event:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error in logJobTimelineEvent:", error);
    return null;
  }
}

/**
 * Helper functions for each event type category
 */

// Homeowner Communication
export async function logHomeownerMessage(
  jobId: string | undefined,
  leadId: string | undefined,
  direction: "inbound" | "outbound",
  message: string,
  metadata?: Record<string, any>
) {
  return logJobTimelineEvent({
    jobId,
    leadId,
    eventType: direction === "inbound" ? "homeowner_message_inbound" : "homeowner_message_outbound",
    message,
    eventData: metadata,
  });
}

export async function logHomeownerConfirmation(
  jobId: string | undefined,
  leadId: string | undefined,
  confirmationType: string,
  details?: Record<string, any>
) {
  return logJobTimelineEvent({
    jobId,
    leadId,
    eventType: "homeowner_confirmation",
    message: `Homeowner confirmed ${confirmationType}`,
    eventData: details,
  });
}

// Crew Actions
export async function logCrewAction(
  jobId: string,
  action: "assigned" | "on_way" | "arrived" | "completed",
  crewName?: string,
  details?: Record<string, any>
) {
  const eventTypeMap = {
    assigned: "crew_assigned",
    on_way: "crew_on_way",
    arrived: "crew_arrived",
    completed: "crew_job_completed",
  };

  return logJobTimelineEvent({
    jobId,
    eventType: eventTypeMap[action] as TimelineEventType,
    message: `Crew ${action === "on_way" ? "on the way" : action}`,
    eventData: { crewName, ...details },
  });
}

export async function logCrewIssue(
  jobId: string,
  issueDescription: string,
  details?: Record<string, any>
) {
  return logJobTimelineEvent({
    jobId,
    eventType: "crew_issue_reported",
    message: issueDescription,
    eventData: details,
  });
}

// Supplier Actions
export async function logSupplierAction(
  jobId: string,
  action: "po_sent" | "confirmed" | "delivery_scheduled" | "delivery_failed",
  supplierName?: string,
  details?: Record<string, any>
) {
  const eventTypeMap = {
    po_sent: "supplier_po_sent",
    confirmed: "supplier_confirmed",
    delivery_scheduled: "supplier_delivery_scheduled",
    delivery_failed: "supplier_delivery_failed",
  };

  return logJobTimelineEvent({
    jobId,
    eventType: eventTypeMap[action] as TimelineEventType,
    message: `Supplier ${action === "po_sent" ? "PO sent" : action}`,
    eventData: { supplierName, ...details },
  });
}

// Material Events
export async function logMaterialEvent(
  jobId: string,
  event: "takeoff_created" | "po_created" | "confirmation" | "shortage_alert",
  description: string,
  details?: Record<string, any>
) {
  const eventTypeMap = {
    takeoff_created: "material_takeoff_created",
    po_created: "material_po_created",
    confirmation: "material_confirmation",
    shortage_alert: "material_shortage_alert",
  };

  return logJobTimelineEvent({
    jobId,
    eventType: eventTypeMap[event] as TimelineEventType,
    message: description,
    eventData: details,
  });
}

// Insurance Events
export async function logInsuranceEvent(
  jobId: string | undefined,
  leadId: string | undefined,
  event: "claim_filed" | "adjuster_assigned" | "adjuster_inspection" | "acv_received" | "supplement_submitted" | "supplement_approved" | "depreciation_received",
  description: string,
  details?: Record<string, any>
) {
  const eventTypeMap = {
    claim_filed: "insurance_claim_filed",
    adjuster_assigned: "insurance_adjuster_assigned",
    adjuster_inspection: "insurance_adjuster_inspection",
    acv_received: "insurance_acv_received",
    supplement_submitted: "insurance_supplement_submitted",
    supplement_approved: "insurance_supplement_approved",
    depreciation_received: "insurance_depreciation_received",
  };

  return logJobTimelineEvent({
    jobId,
    leadId,
    eventType: eventTypeMap[event] as TimelineEventType,
    message: description,
    eventData: details,
  });
}

// Payment Events
export async function logPaymentEvent(
  jobId: string,
  event: "deposit_invoice_sent" | "deposit_collected" | "final_invoice_sent" | "final_collected" | "insurance_recorded" | "overdue_alert",
  amount?: number,
  details?: Record<string, any>
) {
  const eventTypeMap = {
    deposit_invoice_sent: "payment_deposit_invoice_sent",
    deposit_collected: "payment_deposit_collected",
    final_invoice_sent: "payment_final_invoice_sent",
    final_collected: "payment_final_collected",
    insurance_recorded: "payment_insurance_recorded",
    overdue_alert: "payment_overdue_alert",
  };

  return logJobTimelineEvent({
    jobId,
    eventType: eventTypeMap[event] as TimelineEventType,
    message: `Payment event: ${event}`,
    eventData: { amount, ...details },
  });
}

// Scheduling Events
export async function logSchedulingEvent(
  jobId: string | undefined,
  leadId: string | undefined,
  event: "inspection_scheduled" | "installation_scheduled" | "rescheduled" | "weather_delay" | "homeowner_request",
  description: string,
  details?: Record<string, any>
) {
  const eventTypeMap = {
    inspection_scheduled: "scheduling_inspection_scheduled",
    installation_scheduled: "scheduling_installation_scheduled",
    rescheduled: "scheduling_rescheduled",
    weather_delay: "scheduling_weather_delay",
    homeowner_request: "scheduling_homeowner_request",
  };

  return logJobTimelineEvent({
    jobId,
    leadId,
    eventType: eventTypeMap[event] as TimelineEventType,
    message: description,
    eventData: details,
  });
}

// Weather Events
export async function logWeatherEvent(
  jobId: string | undefined,
  leadId: string | undefined,
  event: "alert" | "hail_impact" | "wind_risk" | "job_day_change",
  description: string,
  details?: Record<string, any>
) {
  const eventTypeMap = {
    alert: "weather_alert",
    hail_impact: "weather_hail_impact",
    wind_risk: "weather_wind_risk",
    job_day_change: "weather_job_day_change",
  };

  return logJobTimelineEvent({
    jobId,
    leadId,
    eventType: eventTypeMap[event] as TimelineEventType,
    message: description,
    eventData: details,
  });
}

// Internal Notes
export async function logInternalNote(
  jobId: string | undefined,
  leadId: string | undefined,
  noteType: "note" | "crew_note" | "homeowner_behavior" | "material_reminder" | "quality_control",
  note: string,
  details?: Record<string, any>
) {
  const eventTypeMap = {
    note: "internal_note",
    crew_note: "internal_crew_note",
    homeowner_behavior: "internal_homeowner_behavior",
    material_reminder: "internal_material_reminder",
    quality_control: "internal_quality_control",
  };

  return logJobTimelineEvent({
    jobId,
    leadId,
    eventType: eventTypeMap[noteType] as TimelineEventType,
    message: note,
    eventData: details,
  });
}

// Status Changes
export async function logStatusChange(
  jobId: string | undefined,
  leadId: string | undefined,
  newStatus: "lead_in" | "inspection" | "quote_sent" | "approved" | "scheduled" | "installed" | "completed" | "cancelled",
  oldStatus?: string,
  details?: Record<string, any>
) {
  const eventTypeMap = {
    lead_in: "status_lead_in",
    inspection: "status_inspection",
    quote_sent: "status_quote_sent",
    approved: "status_approved",
    scheduled: "status_scheduled",
    installed: "status_installed",
    completed: "status_completed",
    cancelled: "status_cancelled",
  };

  return logJobTimelineEvent({
    jobId,
    leadId,
    eventType: eventTypeMap[newStatus] as TimelineEventType,
    message: `Status changed to ${newStatus}`,
    eventData: { oldStatus, newStatus, ...details },
  });
}






































