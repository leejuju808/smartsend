// Block 20680 — SmartSend Roofing Activity Feed v1
// Helper library for logging roofing-specific activity feed events

import { createClient } from "@/lib/supabase/server";

export type RoofingActivityEventType =
  // 🔵 Lead Activity
  | "new_email_received"
  | "homeowner_replied"
  | "homeowner_asked_for_estimate"
  | "lead_marked_hot"
  | "lead_marked_warm"
  | "lead_marked_cold"
  | "homeowner_clicked_proposal"
  // 🟢 Insurance Activity
  | "claim_filed_detected"
  | "adjuster_assigned"
  | "adjuster_visit_scheduled"
  | "claim_approved"
  | "claim_denied"
  | "supplement_items_detected"
  | "missing_code_items_detected"
  | "scope_parsed_successfully"
  | "insurance_email_forwarded"
  | "adjuster_responded"
  // 🟠 Proposal & Estimate Activity
  | "estimate_generated"
  | "proposal_created"
  | "proposal_emailed_to_homeowner"
  | "pricing_dispute_email_drafted"
  | "homeowner_requested_changes"
  // 🟣 Adjuster Communications
  | "supplement_request_sent"
  | "pricing_dispute_sent"
  | "adjuster_followup_sent"
  | "adjuster_replied"
  | "need_photos_requested"
  // 🟡 CRM / Job Stage Updates
  | "stage_new_lead"
  | "stage_claim_filed"
  | "stage_adjuster_scheduled"
  | "stage_claim_pending"
  | "stage_claim_approved"
  | "stage_install_ready"
  | "stage_scheduled_install"
  | "stage_in_progress"
  | "stage_completed"
  | "stage_lost"
  | "stage_not_a_fit"
  // 🔴 High-Urgency Warnings
  | "adjuster_unresponsive_72h"
  | "homeowner_replied_waiting"
  | "install_ready_no_proposal"
  | "supplement_value_high_not_requested";

export interface LogRoofingActivityParams {
  event_type: RoofingActivityEventType;
  event_text: string;
  event_payload?: Record<string, any>;
  lead_id?: string | null;
  job_id?: string | null;
  thread_id?: string | null;
  campaign_id?: string | null;
  created_by?: "smart_ai" | "contractor_user";
  user_id?: string | null;
}

/**
 * Log a roofing activity feed event
 * This is a best-effort function that won't throw errors
 */
export async function logRoofingActivity(
  params: LogRoofingActivityParams
): Promise<string | null> {
  try {
    const supabase = createClient();

    // Call the database function
    const { data, error } = await supabase.rpc("log_activity_feed_event", {
      p_event_type: params.event_type,
      p_event_text: params.event_text,
      p_event_payload: params.event_payload || {},
      p_lead_id: params.lead_id || null,
      p_job_id: params.job_id || null,
      p_thread_id: params.thread_id || null,
      p_campaign_id: params.campaign_id || null,
      p_created_by: params.created_by || "smart_ai",
      p_user_id: params.user_id || null,
    });

    if (error) {
      console.error("[Roofing Activity Feed] Failed to log event:", error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error("[Roofing Activity Feed] Unexpected error:", error);
    // Don't throw - logging failures shouldn't break the app
    return null;
  }
}

/**
 * Convenience functions for common roofing activity types
 */
export const RoofingActivityLogger = {
  // 🔵 Lead Activity
  logNewEmailReceived: async (params: {
    thread_id: string;
    lead_id?: string;
    campaign_id?: string;
    homeowner_name?: string;
    subject?: string;
  }) => {
    return logRoofingActivity({
      event_type: "new_email_received",
      event_text: `New email received${params.homeowner_name ? ` from ${params.homeowner_name}` : ""}${params.subject ? `: "${params.subject}"` : ""}`,
      event_payload: {
        homeowner_name: params.homeowner_name,
        subject: params.subject,
      },
      thread_id: params.thread_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  logHomeownerReplied: async (params: {
    thread_id: string;
    lead_id?: string;
    campaign_id?: string;
    homeowner_name?: string;
    message_preview?: string;
  }) => {
    return logRoofingActivity({
      event_type: "homeowner_replied",
      event_text: `${params.homeowner_name || "Homeowner"} replied${params.message_preview ? `: "${params.message_preview}"` : ""}`,
      event_payload: {
        homeowner_name: params.homeowner_name,
        message_preview: params.message_preview,
      },
      thread_id: params.thread_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  logLeadMarkedHot: async (params: {
    lead_id: string;
    thread_id?: string;
    campaign_id?: string;
    homeowner_name?: string;
    hot_score?: number;
  }) => {
    return logRoofingActivity({
      event_type: "lead_marked_hot",
      event_text: `Lead marked HOT${params.hot_score ? ` (score: ${params.hot_score})` : ""}`,
      event_payload: {
        homeowner_name: params.homeowner_name,
        hot_score: params.hot_score,
      },
      lead_id: params.lead_id,
      thread_id: params.thread_id,
      campaign_id: params.campaign_id,
    });
  },

  // 🟢 Insurance Activity
  logClaimFiled: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    carrier?: string;
    claim_number?: string;
  }) => {
    return logRoofingActivity({
      event_type: "claim_filed_detected",
      event_text: `Insurance Claim Filed${params.carrier ? ` — Carrier: ${params.carrier}` : ""}${params.claim_number ? ` · Claim #${params.claim_number}` : ""}`,
      event_payload: {
        carrier: params.carrier,
        claim_number: params.claim_number,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  logAdjusterAssigned: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    adjuster_name?: string;
    carrier?: string;
  }) => {
    return logRoofingActivity({
      event_type: "adjuster_assigned",
      event_text: `Adjuster Assigned${params.adjuster_name ? `: ${params.adjuster_name}` : ""}${params.carrier ? ` (${params.carrier})` : ""}`,
      event_payload: {
        adjuster_name: params.adjuster_name,
        carrier: params.carrier,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  logClaimApproved: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    rcv_total?: number;
    carrier?: string;
  }) => {
    return logRoofingActivity({
      event_type: "claim_approved",
      event_text: `Claim Approved${params.rcv_total ? ` (RCV $${params.rcv_total.toLocaleString()})` : ""}${params.carrier ? ` — ${params.carrier}` : ""}`,
      event_payload: {
        rcv_total: params.rcv_total,
        carrier: params.carrier,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  logClaimDenied: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    reason?: string;
  }) => {
    return logRoofingActivity({
      event_type: "claim_denied",
      event_text: `Claim Denied${params.reason ? ` — ${params.reason}` : ""}`,
      event_payload: {
        reason: params.reason,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  // 🟠 Proposal & Estimate Activity
  logEstimateGenerated: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    estimate_value?: number;
    homeowner_name?: string;
  }) => {
    return logRoofingActivity({
      event_type: "estimate_generated",
      event_text: `Estimate Generated${params.estimate_value ? ` — $${params.estimate_value.toLocaleString()}` : ""}`,
      event_payload: {
        estimate_value: params.estimate_value,
        homeowner_name: params.homeowner_name,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  logProposalSent: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    proposal_value?: number;
    homeowner_name?: string;
  }) => {
    return logRoofingActivity({
      event_type: "proposal_emailed_to_homeowner",
      event_text: `Proposal Sent to Homeowner${params.proposal_value ? ` — $${params.proposal_value.toLocaleString()}` : ""}`,
      event_payload: {
        proposal_value: params.proposal_value,
        homeowner_name: params.homeowner_name,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  // 🟣 Adjuster Communications
  logSupplementRequestSent: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    supplement_value?: number;
    adjuster_name?: string;
  }) => {
    return logRoofingActivity({
      event_type: "supplement_request_sent",
      event_text: `Supplement Request Sent${params.supplement_value ? ` — $${params.supplement_value.toLocaleString()}` : ""}${params.adjuster_name ? ` to ${params.adjuster_name}` : ""}`,
      event_payload: {
        supplement_value: params.supplement_value,
        adjuster_name: params.adjuster_name,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  logAdjusterFollowupSent: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    adjuster_name?: string;
    wait_hours?: number;
  }) => {
    return logRoofingActivity({
      event_type: "adjuster_followup_sent",
      event_text: `Adjuster Follow-Up Email Sent${params.wait_hours ? ` — Waiting ${params.wait_hours} hours for response` : ""}`,
      event_payload: {
        adjuster_name: params.adjuster_name,
        wait_hours: params.wait_hours,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  // 🟡 CRM / Job Stage Updates
  logStageChange: async (params: {
    job_id: string;
    thread_id?: string;
    lead_id?: string;
    campaign_id?: string;
    old_stage: string;
    new_stage: string;
    status_reason?: string;
    job_value?: number;
  }) => {
    const stageEventMap: Record<string, RoofingActivityEventType> = {
      NEW_LEAD: "stage_new_lead",
      CLAIM_FILED: "stage_claim_filed",
      ADJUSTER_SCHEDULED: "stage_adjuster_scheduled",
      CLAIM_PENDING: "stage_claim_pending",
      CLAIM_APPROVED: "stage_claim_approved",
      INSTALL_READY: "stage_install_ready",
      SCHEDULED_INSTALL: "stage_scheduled_install",
      IN_PROGRESS: "stage_in_progress",
      COMPLETED: "stage_completed",
      LOST: "stage_lost",
      NOT_A_FIT: "stage_not_a_fit",
    };

    const eventType = stageEventMap[params.new_stage] || "stage_new_lead";

    return logRoofingActivity({
      event_type: eventType,
      event_text: `Stage Updated: ${params.old_stage.replace(/_/g, " ")} → ${params.new_stage.replace(/_/g, " ")}${params.status_reason ? ` — ${params.status_reason}` : ""}`,
      event_payload: {
        old_stage: params.old_stage,
        new_stage: params.new_stage,
        status_reason: params.status_reason,
        job_value: params.job_value,
      },
      job_id: params.job_id,
      thread_id: params.thread_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  // 🔴 High-Urgency Warnings
  logAdjusterUnresponsive: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    hours_unresponsive?: number;
    adjuster_name?: string;
  }) => {
    return logRoofingActivity({
      event_type: "adjuster_unresponsive_72h",
      event_text: `⚠️ Urgent: Adjuster unresponsive for ${params.hours_unresponsive || 72} hours${params.adjuster_name ? ` (${params.adjuster_name})` : ""}`,
      event_payload: {
        hours_unresponsive: params.hours_unresponsive || 72,
        adjuster_name: params.adjuster_name,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  logHomeownerRepliedWaiting: async (params: {
    thread_id: string;
    lead_id?: string;
    campaign_id?: string;
    homeowner_name?: string;
    hours_waiting?: number;
  }) => {
    return logRoofingActivity({
      event_type: "homeowner_replied_waiting",
      event_text: `⚠️ Urgent: ${params.homeowner_name || "Homeowner"} replied and waits on contractor${params.hours_waiting ? ` (${params.hours_waiting}h)` : ""}. Recommended Action: CALL NOW`,
      event_payload: {
        homeowner_name: params.homeowner_name,
        hours_waiting: params.hours_waiting,
      },
      thread_id: params.thread_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },

  logInstallReadyNoProposal: async (params: {
    thread_id: string;
    job_id?: string;
    lead_id?: string;
    campaign_id?: string;
    homeowner_name?: string;
  }) => {
    return logRoofingActivity({
      event_type: "install_ready_no_proposal",
      event_text: `⚠️ Urgent: Homeowner is install-ready but no proposal sent${params.homeowner_name ? ` (${params.homeowner_name})` : ""}`,
      event_payload: {
        homeowner_name: params.homeowner_name,
      },
      thread_id: params.thread_id,
      job_id: params.job_id,
      lead_id: params.lead_id,
      campaign_id: params.campaign_id,
    });
  },
};

