/**
 * Block 11200 — SmartSend Lead Timeline v1
 * Utility function to log lead events
 */

import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";

export type LeadEventType =
  | "email_sent"
  | "followup_triggered"
  | "reply_received"
  | "classified"
  | "followup_stopped"
  | "note_added"
  | "status_changed"
  | "action_suggested";

export interface LeadEventMetadata {
  template_id?: string;
  template_name?: string;
  step_number?: number;
  step_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  subject?: string;
  body_preview?: string;
  intent?: string;
  intent_label?: string;
  confidence?: number;
  reply_text?: string;
  note_text?: string;
  status?: string;
  action_text?: string;
  [key: string]: any;
}

/**
 * Log a lead event using the database function
 */
export async function logLeadEvent(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    type: LeadEventType;
    content?: string;
    metadata?: LeadEventMetadata;
  }
): Promise<{ id: string; error?: Error }> {
  try {
    const { data, error } = await supabase.rpc("log_lead_event", {
      p_lead_id: params.leadId,
      p_type: params.type,
      p_content: params.content || null,
      p_metadata: params.metadata || {},
    });

    if (error) {
      console.error("Error logging lead event:", error);
      return { id: "", error };
    }

    return { id: data || "" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("Exception logging lead event:", error);
    return { id: "", error };
  }
}

/**
 * Helper: Log email sent event
 */
export async function logEmailSent(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    templateName?: string;
    templateId?: string;
    stepNumber?: number;
    stepName?: string;
    campaignId?: string;
    campaignName?: string;
    subject?: string;
    bodyPreview?: string;
  }
) {
  return logLeadEvent(supabase, {
    leadId: params.leadId,
    type: "email_sent",
    content: `SmartSend sent ${params.templateName || "Message ${params.stepNumber || 1}"}${params.campaignName ? ` (${params.campaignName})` : ""}.`,
    metadata: {
      template_id: params.templateId,
      template_name: params.templateName,
      step_number: params.stepNumber,
      step_name: params.stepName,
      campaign_id: params.campaignId,
      campaign_name: params.campaignName,
      subject: params.subject,
      body_preview: params.bodyPreview,
    },
  });
}

/**
 * Helper: Log follow-up triggered event
 */
export async function logFollowUpTriggered(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    stepNumber: number;
    stepName?: string;
    delayDays?: number;
    campaignId?: string;
    campaignName?: string;
    subject?: string;
  }
) {
  return logLeadEvent(supabase, {
    leadId: params.leadId,
    type: "followup_triggered",
    content: `SmartSend sent Follow-Up ${params.stepNumber}${params.delayDays ? ` (No reply after ${params.delayDays} days)` : ""}.`,
    metadata: {
      step_number: params.stepNumber,
      step_name: params.stepName,
      delay_days: params.delayDays,
      campaign_id: params.campaignId,
      campaign_name: params.campaignName,
      subject: params.subject,
    },
  });
}

/**
 * Helper: Log reply received event
 */
export async function logReplyReceived(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    replyText: string;
    subject?: string;
    intent?: string;
    intentLabel?: string;
    confidence?: number;
  }
) {
  const intentBadge = params.intentLabel
    ? ` (${params.intentLabel.toUpperCase()})`
    : "";

  return logLeadEvent(supabase, {
    leadId: params.leadId,
    type: "reply_received",
    content: `Homeowner replied${intentBadge}.`,
    metadata: {
      reply_text: params.replyText,
      subject: params.subject,
      intent: params.intent,
      intent_label: params.intentLabel,
      confidence: params.confidence,
    },
  });
}

/**
 * Helper: Log classification event
 */
export async function logClassified(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    intentLabel: string;
    reason?: string;
    confidence?: number;
  }
) {
  return logLeadEvent(supabase, {
    leadId: params.leadId,
    type: "classified",
    content: `Lead classified as ${params.intentLabel.toUpperCase()}${params.reason ? ` (${params.reason})` : ""}.`,
    metadata: {
      intent_label: params.intentLabel,
      reason: params.reason,
      confidence: params.confidence,
    },
  });
}

/**
 * Helper: Log follow-up stopped event
 */
export async function logFollowUpStopped(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    reason: string;
  }
) {
  return logLeadEvent(supabase, {
    leadId: params.leadId,
    type: "followup_stopped",
    content: `Auto follow-ups paused — ${params.reason}.`,
    metadata: {
      reason: params.reason,
    },
  });
}

/**
 * Helper: Log note added event
 */
export async function logNoteAdded(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    noteText: string;
  }
) {
  return logLeadEvent(supabase, {
    leadId: params.leadId,
    type: "note_added",
    content: `Roofer added note: ${params.noteText.substring(0, 100)}${params.noteText.length > 100 ? "..." : ""}`,
    metadata: {
      note_text: params.noteText,
    },
  });
}

/**
 * Helper: Log action suggested event
 */
export async function logActionSuggested(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    actionText: string;
  }
) {
  return logLeadEvent(supabase, {
    leadId: params.leadId,
    type: "action_suggested",
    content: `Suggested: ${params.actionText}`,
    metadata: {
      action_text: params.actionText,
    },
  });
}























































