// lib/log.ts
// Universal activity logger for Block 420 — Global Activity Log v1
import { createServerClient } from "./supabase/service";

export interface LogActivityParams {
  workspaceId: string;
  type: 'email' | 'warmup' | 'system' | 'error' | 'team' | 'campaign';
  subtype?: string;
  actorId?: string | null;
  leadId?: string | null;
  campaignId?: string | null;
  stepId?: string | null;
  variantId?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Log activity to workspace_activity table
 * This is the universal logger for Block 420 — Global Activity Log v1
 * 
 * @example
 * await logActivity({
 *   workspaceId: 'xxx',
 *   type: 'email',
 *   subtype: 'sent',
 *   leadId: 'yyy',
 *   campaignId: 'zzz',
 *   metadata: { provider_message_id: 'abc123' }
 * });
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  const {
    workspaceId,
    type,
    subtype,
    actorId = null,
    leadId = null,
    campaignId = null,
    stepId = null,
    variantId = null,
    metadata = {},
  } = params;

  try {
    const supabase = createServerClient();

    const { error } = await supabase.from("workspace_activity").insert({
      workspace_id: workspaceId,
      type,
      subtype: subtype || null,
      actor_id: actorId || null,
      lead_id: leadId || null,
      campaign_id: campaignId || null,
      step_id: stepId || null,
      variant_id: variantId || null,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });

    if (error) {
      console.error("[logActivity] Failed to log activity:", error);
      // Don't throw - logging failures shouldn't break the app
    }
  } catch (err) {
    console.error("[logActivity] Error logging activity:", err);
    // Don't throw - logging failures shouldn't break the app
  }
}

/**
 * Convenience function for logging email events
 */
export async function logEmailActivity(
  workspaceId: string,
  subtype: 'sent' | 'delivered' | 'open' | 'click' | 'bounce' | 'reply',
  options: {
    actorId?: string | null;
    leadId?: string | null;
    campaignId?: string | null;
    stepId?: string | null;
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  return logActivity({
    workspaceId,
    type: 'email',
    subtype,
    ...options,
  });
}

/**
 * Convenience function for logging warmup events
 */
export async function logWarmupActivity(
  workspaceId: string,
  subtype: 'sent' | 'received' | 'reputation_change',
  options: {
    actorId?: string | null;
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  return logActivity({
    workspaceId,
    type: 'warmup',
    subtype,
    ...options,
  });
}

/**
 * Convenience function for logging system events
 */
export async function logSystemActivity(
  workspaceId: string,
  subtype: 'send_queue_dispatched' | 'campaign_started' | 'sequence_paused' | 'daily_quota_reached',
  options: {
    actorId?: string | null;
    campaignId?: string | null;
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  return logActivity({
    workspaceId,
    type: 'system',
    subtype,
    ...options,
  });
}

/**
 * Convenience function for logging errors
 */
export async function logErrorActivity(
  workspaceId: string,
  subtype: 'send_failure' | 'bad_oauth_token' | 'dmarc_spf_issue' | 'api_key_failure',
  options: {
    actorId?: string | null;
    leadId?: string | null;
    campaignId?: string | null;
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  return logActivity({
    workspaceId,
    type: 'error',
    subtype,
    ...options,
  });
}

/**
 * Convenience function for logging team actions
 */
export async function logTeamActivity(
  workspaceId: string,
  subtype: 'member_added' | 'permission_changed' | 'campaign_edited' | 'variant_created',
  options: {
    actorId: string;
    campaignId?: string | null;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  return logActivity({
    workspaceId,
    type: 'team',
    subtype,
    actorId: options.actorId,
    campaignId: options.campaignId || null,
    metadata: options.metadata || {},
  });
}



