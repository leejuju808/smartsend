/**
 * Activity Log Utility for Edge Functions
 * Logs all SmartSend activities to show roofers proof that the system is working
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
 * Log an activity event (Edge Function version)
 * This is a best-effort function that won't throw errors
 */
export async function logActivity(
  supabase: ReturnType<typeof createClient>,
  params: LogActivityParams
): Promise<void> {
  try {
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























































