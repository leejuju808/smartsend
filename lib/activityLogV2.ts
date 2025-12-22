// Block 16600 — SmartSend Activity Log v2
// Helper library for logging activities across all systems

import { createClient } from "@/src/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

interface LogMessagingEventParams {
  workspaceId: string;
  type: string;
  summary: string;
  contactId?: string;
  details?: Record<string, any>;
  messageId?: string;
  threadId?: string;
  campaignId?: string;
}

interface LogPipelineEventParams {
  workspaceId: string;
  type: string;
  summary: string;
  contactId: string;
  pipelineStageKey: string;
  details?: Record<string, any>;
  source?: "ai" | "user" | "system";
}

interface LogSchedulerEventParams {
  workspaceId: string;
  type: string;
  summary: string;
  contactId?: string;
  details?: Record<string, any>;
  appointmentId?: string;
}

interface LogTaskEventParams {
  workspaceId: string;
  type: string;
  summary: string;
  contactId?: string;
  details?: Record<string, any>;
  taskId?: string;
  userId?: string;
}

interface LogStormEventParams {
  workspaceId: string;
  type: string;
  summary: string;
  contactId?: string;
  details?: Record<string, any>;
}

interface LogInsuranceEventParams {
  workspaceId: string;
  type: string;
  summary: string;
  contactId: string;
  details?: Record<string, any>;
}

interface LogRevenueEventParams {
  workspaceId: string;
  type: string;
  summary: string;
  contactId?: string;
  details?: Record<string, any>;
  quoteId?: string;
}

interface LogContactIntelligenceEventParams {
  workspaceId: string;
  type: string;
  summary: string;
  contactId: string;
  details?: Record<string, any>;
}

interface LogUserActionParams {
  workspaceId: string;
  type: string;
  summary: string;
  contactId?: string;
  details?: Record<string, any>;
  userId?: string;
}

/**
 * Activity Log V2 Helper Library
 * Provides convenient functions for logging activities across all SmartSend systems
 */
export class ActivityLogV2 {
  /**
   * Log messaging events (emails, replies, opens, clicks, bounces)
   */
  static async logMessagingEvent(
    supabase: SupabaseClient,
    params: LogMessagingEventParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc("log_messaging_event", {
        p_workspace_id: params.workspaceId,
        p_type: params.type,
        p_summary: params.summary,
        p_contact_id: params.contactId || null,
        p_details: params.details || {},
        p_message_id: params.messageId || null,
        p_thread_id: params.threadId || null,
        p_campaign_id: params.campaignId || null,
      });

      if (error) {
        console.error("Error logging messaging event:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Exception logging messaging event:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log pipeline events (stage movements)
   */
  static async logPipelineEvent(
    supabase: SupabaseClient,
    params: LogPipelineEventParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc("log_pipeline_event", {
        p_workspace_id: params.workspaceId,
        p_type: params.type,
        p_summary: params.summary,
        p_contact_id: params.contactId,
        p_pipeline_stage_key: params.pipelineStageKey,
        p_details: params.details || {},
        p_source: params.source || "system",
      });

      if (error) {
        console.error("Error logging pipeline event:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Exception logging pipeline event:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log scheduler events (appointments, reminders, cancellations)
   */
  static async logSchedulerEvent(
    supabase: SupabaseClient,
    params: LogSchedulerEventParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc("log_scheduler_event", {
        p_workspace_id: params.workspaceId,
        p_type: params.type,
        p_summary: params.summary,
        p_contact_id: params.contactId || null,
        p_details: params.details || {},
        p_appointment_id: params.appointmentId || null,
      });

      if (error) {
        console.error("Error logging scheduler event:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Exception logging scheduler event:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log task events (created, completed, overdue, reassigned)
   */
  static async logTaskEvent(
    supabase: SupabaseClient,
    params: LogTaskEventParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc("log_task_event", {
        p_workspace_id: params.workspaceId,
        p_type: params.type,
        p_summary: params.summary,
        p_contact_id: params.contactId || null,
        p_details: params.details || {},
        p_task_id: params.taskId || null,
        p_user_id: params.userId || null,
      });

      if (error) {
        console.error("Error logging task event:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Exception logging task event:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log storm & weather events
   */
  static async logStormEvent(
    supabase: SupabaseClient,
    params: LogStormEventParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc("log_storm_event", {
        p_workspace_id: params.workspaceId,
        p_type: params.type,
        p_summary: params.summary,
        p_contact_id: params.contactId || null,
        p_details: params.details || {},
      });

      if (error) {
        console.error("Error logging storm event:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Exception logging storm event:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log insurance events
   */
  static async logInsuranceEvent(
    supabase: SupabaseClient,
    params: LogInsuranceEventParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc("log_insurance_event", {
        p_workspace_id: params.workspaceId,
        p_type: params.type,
        p_summary: params.summary,
        p_contact_id: params.contactId,
        p_details: params.details || {},
      });

      if (error) {
        console.error("Error logging insurance event:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Exception logging insurance event:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log revenue events (quotes, estimates, forecasts)
   */
  static async logRevenueEvent(
    supabase: SupabaseClient,
    params: LogRevenueEventParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc("log_revenue_event", {
        p_workspace_id: params.workspaceId,
        p_type: params.type,
        p_summary: params.summary,
        p_contact_id: params.contactId || null,
        p_details: params.details || {},
        p_quote_id: params.quoteId || null,
      });

      if (error) {
        console.error("Error logging revenue event:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Exception logging revenue event:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log contact intelligence events (enrichment, personalization, scoring)
   */
  static async logContactIntelligenceEvent(
    supabase: SupabaseClient,
    params: LogContactIntelligenceEventParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc("log_contact_intelligence_event", {
        p_workspace_id: params.workspaceId,
        p_type: params.type,
        p_summary: params.summary,
        p_contact_id: params.contactId,
        p_details: params.details || {},
      });

      if (error) {
        console.error("Error logging contact intelligence event:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Exception logging contact intelligence event:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log user actions (manual changes, uploads, etc.)
   */
  static async logUserAction(
    supabase: SupabaseClient,
    params: LogUserActionParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc("log_user_action", {
        p_workspace_id: params.workspaceId,
        p_type: params.type,
        p_summary: params.summary,
        p_contact_id: params.contactId || null,
        p_details: params.details || {},
        p_user_id: params.userId || null,
      });

      if (error) {
        console.error("Error logging user action:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("Exception logging user action:", error);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Convenience functions for common event types
 */
export const ActivityLogV2Helpers = {
  // Messaging
  logEmailSent: async (
    supabase: SupabaseClient,
    workspaceId: string,
    contactId: string,
    subject: string,
    campaignId?: string
  ) => {
    return ActivityLogV2.logMessagingEvent(supabase, {
      workspaceId,
      type: "email_sent",
      summary: `Email sent: ${subject}`,
      contactId,
      details: { subject, campaign_id: campaignId },
      campaignId,
    });
  },

  logReplyReceived: async (
    supabase: SupabaseClient,
    workspaceId: string,
    contactId: string,
    snippet: string,
    messageId?: string,
    threadId?: string
  ) => {
    return ActivityLogV2.logMessagingEvent(supabase, {
      workspaceId,
      type: "reply_received",
      summary: `Reply received: ${snippet.substring(0, 100)}`,
      contactId,
      details: { snippet },
      messageId,
      threadId,
    });
  },

  // Pipeline
  logPipelineMove: async (
    supabase: SupabaseClient,
    workspaceId: string,
    contactId: string,
    fromStage: string,
    toStage: string,
    source: "ai" | "user" | "system" = "system"
  ) => {
    const typeMap: Record<string, string> = {
      warm_leads: "moved_to_warm",
      hot_leads: "moved_to_hot",
      appointment_booked: "moved_to_appointment",
      insurance_opportunity: "moved_to_insurance",
      quote_sent: "moved_to_quote_sent",
      requote_revival: "moved_to_requote",
      not_interested: "moved_to_not_interested",
    };

    return ActivityLogV2.logPipelineEvent(supabase, {
      workspaceId,
      type: typeMap[toStage] || "auto_pipeline_movement",
      summary: `Moved from ${fromStage} to ${toStage}`,
      contactId,
      pipelineStageKey: toStage,
      details: { from_stage: fromStage, to_stage: toStage },
      source,
    });
  },

  // Tasks
  logTaskCreated: async (
    supabase: SupabaseClient,
    workspaceId: string,
    taskId: string,
    title: string,
    contactId?: string,
    userId?: string
  ) => {
    return ActivityLogV2.logTaskEvent(supabase, {
      workspaceId,
      type: "task_created",
      summary: `Task created: ${title}`,
      contactId,
      details: { title },
      taskId,
      userId,
    });
  },

  logTaskCompleted: async (
    supabase: SupabaseClient,
    workspaceId: string,
    taskId: string,
    title: string,
    contactId?: string,
    userId?: string
  ) => {
    return ActivityLogV2.logTaskEvent(supabase, {
      workspaceId,
      type: "task_completed",
      summary: `Task completed: ${title}`,
      contactId,
      details: { title },
      taskId,
      userId,
    });
  },

  // Scheduler
  logAppointmentBooked: async (
    supabase: SupabaseClient,
    workspaceId: string,
    contactId: string,
    appointmentTime: string,
    appointmentId?: string
  ) => {
    return ActivityLogV2.logSchedulerEvent(supabase, {
      workspaceId,
      type: "appointment_booked",
      summary: `Appointment booked for ${appointmentTime}`,
      contactId,
      details: { appointment_time: appointmentTime },
      appointmentId,
    });
  },

  // Insurance
  logInsuranceDetected: async (
    supabase: SupabaseClient,
    workspaceId: string,
    contactId: string,
    reason: string
  ) => {
    return ActivityLogV2.logInsuranceEvent(supabase, {
      workspaceId,
      type: "adjuster_mentioned",
      summary: `Insurance opportunity detected: ${reason}`,
      contactId,
      details: { reason },
    });
  },

  // Revenue
  logQuoteAdded: async (
    supabase: SupabaseClient,
    workspaceId: string,
    contactId: string,
    amount: number,
    quoteId?: string
  ) => {
    return ActivityLogV2.logRevenueEvent(supabase, {
      workspaceId,
      type: "quote_added",
      summary: `Quote added: $${amount.toLocaleString()}`,
      contactId,
      details: { amount },
      quoteId,
    });
  },
};





















































