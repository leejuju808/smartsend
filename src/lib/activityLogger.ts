// Block 15000 — SmartSend Activity Logs v1
// Helper library for logging activities throughout the codebase

import { createSupabaseServer } from "@/lib/supabaseServer";

export type ActivityCategory =
  | "sending"
  | "inbox"
  | "contact"
  | "campaign"
  | "task"
  | "pipeline"
  | "scheduler"
  | "deliverability"
  | "team"
  | "billing";

export type ActivityType =
  // Sending Events
  | "campaign_email_sent"
  | "followup_sent"
  | "warmup_email_sent"
  | "suppression_blocked_send"
  | "plan_limit_blocked_send"
  // Inbox Events
  | "new_reply_received"
  | "intent_detected"
  | "tags_applied"
  | "lead_score_updated"
  | "pipeline_moved"
  | "message_intelligence_triggered"
  // Contact Events
  | "contact_created"
  | "contact_imported"
  | "contact_updated"
  | "tag_added"
  | "tag_removed"
  | "enrichment_added"
  // Campaign Events
  | "campaign_created"
  | "campaign_edited"
  | "campaign_started"
  | "campaign_paused"
  | "campaign_completed"
  | "step_skipped"
  | "template_updated"
  // Task Events
  | "task_created"
  | "task_assigned"
  | "task_marked_done"
  | "overdue_task_alert"
  // Pipeline Events
  | "moved_to_hot"
  | "moved_to_warm"
  | "moved_to_cold"
  | "moved_to_followup"
  | "moved_to_not_interested"
  | "auto_moved_by_intent"
  | "auto_moved_by_lead_score"
  // Scheduler Events
  | "appointment_booked"
  | "appointment_rescheduled"
  | "appointment_canceled"
  | "no_show_logged"
  // Deliverability Events
  | "bounce_detected"
  | "spam_complaint"
  | "domain_health_score_drop"
  | "warmup_stage_advanced"
  | "dns_failed"
  | "sender_reputation_flagged"
  // Team Events
  | "user_invited"
  | "role_changed"
  | "staff_assigned_to_lead"
  | "staff_removed"
  | "login_from_new_device"
  | "user_removed"
  // Billing Events
  | "plan_upgraded"
  | "plan_downgraded"
  | "card_failed"
  | "trial_started"
  | "trial_ended"
  | "plan_canceled"
  | "stripe_sync_event";

export interface LogActivityParams {
  workspace_id: string;
  category: ActivityCategory;
  type: ActivityType;
  event_type?: string;
  event_data?: Record<string, any>;
  contact_id?: string;
  campaign_id?: string;
  lead_id?: string;
  revenue_value?: number;
  metadata?: Record<string, any>;
  user_id?: string | null; // null for system events
}

/**
 * Log an activity event
 * This is a best-effort function that won't throw errors
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const supabase = createSupabaseServer();

    const { error } = await supabase.from("activity_logs").insert({
      workspace_id: params.workspace_id,
      user_id: params.user_id ?? null,
      category: params.category,
      type: params.type,
      event_type: params.event_type || null,
      event_data: params.event_data || {},
      contact_id: params.contact_id || null,
      campaign_id: params.campaign_id || null,
      lead_id: params.lead_id || null,
      revenue_value: params.revenue_value || null,
      metadata: params.metadata || {},
    });

    if (error) {
      console.error("[Activity Logger] Failed to log activity:", error);
      // Don't throw - logging failures shouldn't break the app
    }
  } catch (error) {
    console.error("[Activity Logger] Unexpected error:", error);
    // Don't throw - logging failures shouldn't break the app
  }
}

/**
 * Convenience functions for common activity types
 */
export const ActivityLogger = {
  // Sending Events
  logEmailSent: async (
    workspaceId: string,
    options: {
      userId?: string | null;
      contactId?: string;
      campaignId?: string;
      leadId?: string;
      subject?: string;
      templateId?: string;
    }
  ) => {
    await logActivity({
      workspace_id: workspaceId,
      category: "sending",
      type: "campaign_email_sent",
      event_type: "campaign_email_sent",
      event_data: {
        subject: options.subject,
        template_id: options.templateId,
      },
      contact_id: options.contactId,
      campaign_id: options.campaignId,
      lead_id: options.leadId,
      user_id: options.userId,
    });
  },

  logFollowUpSent: async (
    workspaceId: string,
    options: {
      userId?: string | null;
      contactId?: string;
      campaignId?: string;
      leadId?: string;
      followUpNumber?: number;
    }
  ) => {
    await logActivity({
      workspace_id: workspaceId,
      category: "sending",
      type: "followup_sent",
      event_type: "followup_sent",
      event_data: {
        follow_up_number: options.followUpNumber,
      },
      contact_id: options.contactId,
      campaign_id: options.campaignId,
      lead_id: options.leadId,
      user_id: options.userId,
    });
  },

  // Inbox Events
  logReplyReceived: async (
    workspaceId: string,
    options: {
      userId?: string | null;
      contactId?: string;
      leadId?: string;
      intent?: string;
      snippet?: string;
    }
  ) => {
    await logActivity({
      workspace_id: workspaceId,
      category: "inbox",
      type: "new_reply_received",
      event_type: "new_reply_received",
      event_data: {
        intent: options.intent,
        snippet: options.snippet,
      },
      contact_id: options.contactId,
      lead_id: options.leadId,
      user_id: options.userId,
    });
  },

  // Contact Events
  logContactCreated: async (
    workspaceId: string,
    options: {
      userId?: string | null;
      contactId: string;
      email?: string;
      source?: string;
    }
  ) => {
    await logActivity({
      workspace_id: workspaceId,
      category: "contact",
      type: "contact_created",
      event_type: "contact_created",
      event_data: {
        email: options.email,
        source: options.source,
      },
      contact_id: options.contactId,
      user_id: options.userId,
    });
  },

  // Campaign Events
  logCampaignCreated: async (
    workspaceId: string,
    options: {
      userId: string;
      campaignId: string;
      campaignName?: string;
    }
  ) => {
    await logActivity({
      workspace_id: workspaceId,
      category: "campaign",
      type: "campaign_created",
      event_type: "campaign_created",
      event_data: {
        campaign_name: options.campaignName,
      },
      campaign_id: options.campaignId,
      user_id: options.userId,
    });
  },

  logCampaignStarted: async (
    workspaceId: string,
    options: {
      userId?: string | null;
      campaignId: string;
      campaignName?: string;
    }
  ) => {
    await logActivity({
      workspace_id: workspaceId,
      category: "campaign",
      type: "campaign_started",
      event_type: "campaign_started",
      event_data: {
        campaign_name: options.campaignName,
      },
      campaign_id: options.campaignId,
      user_id: options.userId,
    });
  },

  // Task Events
  logTaskCreated: async (
    workspaceId: string,
    options: {
      userId: string;
      taskId: string;
      contactId?: string;
      leadId?: string;
      title?: string;
    }
  ) => {
    await logActivity({
      workspace_id: workspaceId,
      category: "task",
      type: "task_created",
      event_type: "task_created",
      event_data: {
        task_id: options.taskId,
        title: options.title,
      },
      contact_id: options.contactId,
      lead_id: options.leadId,
      user_id: options.userId,
    });
  },

  // Pipeline Events
  logPipelineMoved: async (
    workspaceId: string,
    options: {
      userId?: string | null;
      contactId?: string;
      leadId?: string;
      fromStage?: string;
      toStage: string;
      reason?: string;
    }
  ) => {
    const typeMap: Record<string, ActivityType> = {
      hot: "moved_to_hot",
      warm: "moved_to_warm",
      cold: "moved_to_cold",
      followup: "moved_to_followup",
      not_interested: "moved_to_not_interested",
    };

    const type = typeMap[options.toStage.toLowerCase()] || "pipeline_moved";

    await logActivity({
      workspace_id: workspaceId,
      category: "pipeline",
      type,
      event_type: type,
      event_data: {
        from_stage: options.fromStage,
        to_stage: options.toStage,
        reason: options.reason,
      },
      contact_id: options.contactId,
      lead_id: options.leadId,
      user_id: options.userId,
    });
  },

  // Deliverability Events
  logBounceDetected: async (
    workspaceId: string,
    options: {
      contactId?: string;
      email?: string;
      bounceType?: string;
    }
  ) => {
    await logActivity({
      workspace_id: workspaceId,
      category: "deliverability",
      type: "bounce_detected",
      event_type: "bounce_detected",
      event_data: {
        email: options.email,
        bounce_type: options.bounceType,
      },
      contact_id: options.contactId,
      user_id: null, // System event
    });
  },
};





















































