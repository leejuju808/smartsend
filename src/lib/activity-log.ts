/**
 * Activity Log Utility
 * Logs all SmartSend activities to show roofers proof that the system is working
 */

import { createClient } from "@supabase/supabase-js";

type ActivityType =
  | "email_sent"
  | "followup_triggered"
  | "reply_received"
  | "classified"
  | "sequence_paused"
  | "import"
  | "campaign_launched";

interface LogActivityParams {
  workspace_id: string;
  user_id?: string | null;
  campaign_id?: string | null;
  lead_id?: string | null;
  type: ActivityType;
  metadata?: Record<string, any>;
}

/**
 * Log an activity event
 * This is a best-effort function that won't throw errors
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn("Activity log: Missing Supabase credentials");
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from("activity_logs").insert({
      workspace_id: params.workspace_id,
      user_id: params.user_id || null,
      campaign_id: params.campaign_id || null,
      lead_id: params.lead_id || null,
      type: params.type,
      metadata: params.metadata || {},
    });
  } catch (error) {
    // Non-critical: log but don't throw
    console.warn("Failed to log activity:", error);
  }
}

/**
 * Helper functions for specific activity types
 */
export const ActivityLogger = {
  emailSent: async (params: {
    workspace_id: string;
    user_id?: string | null;
    campaign_id?: string | null;
    lead_id?: string | null;
    to_email: string;
    to_name?: string | null;
    subject: string;
    template_name?: string | null;
  }) => {
    await logActivity({
      workspace_id: params.workspace_id,
      user_id: params.user_id,
      campaign_id: params.campaign_id,
      lead_id: params.lead_id,
      type: "email_sent",
      metadata: {
        to_email: params.to_email,
        to_name: params.to_name,
        subject: params.subject,
        template_name: params.template_name,
      },
    });
  },

  followupTriggered: async (params: {
    workspace_id: string;
    user_id?: string | null;
    campaign_id?: string | null;
    lead_id?: string | null;
    to_email: string;
    to_name?: string | null;
    followup_number?: number;
    days_since_last?: number;
  }) => {
    await logActivity({
      workspace_id: params.workspace_id,
      user_id: params.user_id,
      campaign_id: params.campaign_id,
      lead_id: params.lead_id,
      type: "followup_triggered",
      metadata: {
        to_email: params.to_email,
        to_name: params.to_name,
        followup_number: params.followup_number,
        days_since_last: params.days_since_last,
      },
    });
  },

  replyReceived: async (params: {
    workspace_id: string;
    user_id?: string | null;
    campaign_id?: string | null;
    lead_id?: string | null;
    from_email: string;
    from_name?: string | null;
    subject?: string | null;
    reply_preview?: string | null;
  }) => {
    await logActivity({
      workspace_id: params.workspace_id,
      user_id: params.user_id,
      campaign_id: params.campaign_id,
      lead_id: params.lead_id,
      type: "reply_received",
      metadata: {
        from_email: params.from_email,
        from_name: params.from_name,
        subject: params.subject,
        reply_preview: params.reply_preview,
      },
    });
  },

  leadClassified: async (params: {
    workspace_id: string;
    user_id?: string | null;
    campaign_id?: string | null;
    lead_id: string;
    lead_email: string;
    lead_name?: string | null;
    classification: string; // e.g., "hot", "warm", "cold", "HOT", "WARM", "FOLLOW_UP", "NEW"
    reason?: string | null;
    old_classification?: string | null; // Block 11500: Track old classification for revenue change
  }) => {
    // Block 11500: Calculate revenue change
    const valueMap: Record<string, number> = {
      HOT: 7000,
      WARM: 2500,
      FOLLOW_UP: 1000,
      NEW: 300,
      NOT_INTERESTED: 0,
      OUT_OF_SCOPE: 0,
      hot: 7000,
      warm: 2500,
      follow_up: 1000,
      new: 300,
      not_interested: 0,
      out_of_scope: 0,
    };
    
    const newValue = valueMap[params.classification.toUpperCase()] ?? 300;
    const oldValue = params.old_classification 
      ? (valueMap[params.old_classification.toUpperCase()] ?? 0)
      : 0;
    const valueChange = newValue - oldValue;

    await logActivity({
      workspace_id: params.workspace_id,
      user_id: params.user_id,
      campaign_id: params.campaign_id,
      lead_id: params.lead_id,
      type: "classified",
      metadata: {
        lead_email: params.lead_email,
        lead_name: params.lead_name,
        classification: params.classification,
        reason: params.reason,
        // Block 11500: Revenue estimator fields
        old_classification: params.old_classification,
        estimated_value: newValue,
        value_change: valueChange,
        revenue_message: valueChange > 0 
          ? `${params.classification.toUpperCase()} lead detected → Estimated job value increased by $${valueChange.toLocaleString()}.`
          : valueChange < 0
          ? `Lead classification changed to ${params.classification.toUpperCase()} → Estimated job value decreased by $${Math.abs(valueChange).toLocaleString()}.`
          : null,
      },
    });
  },

  sequencePaused: async (params: {
    workspace_id: string;
    user_id?: string | null;
    campaign_id?: string | null;
    lead_id: string;
    lead_email: string;
    lead_name?: string | null;
    reason: string; // e.g., "replied", "unsubscribed"
  }) => {
    await logActivity({
      workspace_id: params.workspace_id,
      user_id: params.user_id,
      campaign_id: params.campaign_id,
      lead_id: params.lead_id,
      type: "sequence_paused",
      metadata: {
        lead_email: params.lead_email,
        lead_name: params.lead_name,
        reason: params.reason,
      },
    });
  },

  importCompleted: async (params: {
    workspace_id: string;
    user_id?: string | null;
    campaign_id?: string | null;
    count: number;
    list_name?: string | null;
    filename?: string | null;
  }) => {
    await logActivity({
      workspace_id: params.workspace_id,
      user_id: params.user_id,
      campaign_id: params.campaign_id,
      type: "import",
      metadata: {
        count: params.count,
        list_name: params.list_name,
        filename: params.filename,
      },
    });
  },

  campaignLaunched: async (params: {
    workspace_id: string;
    user_id?: string | null;
    campaign_id: string;
    campaign_name: string;
    contact_count: number;
  }) => {
    await logActivity({
      workspace_id: params.workspace_id,
      user_id: params.user_id,
      campaign_id: params.campaign_id,
      type: "campaign_launched",
      metadata: {
        campaign_name: params.campaign_name,
        contact_count: params.contact_count,
      },
    });
  },
};

