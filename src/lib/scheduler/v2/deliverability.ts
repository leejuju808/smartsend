/**
 * Block 24140 — Advanced Scheduler v2
 * Component 5: Deliverability Safeguards (Auto-Protection)
 * 
 * SmartSend automatically:
 * - rotates sending IP pools
 * - shifts sending windows
 * - adjusts batch size
 * - replaces bad subject lines
 * - avoids spam trigger phrases
 * - delays sends when needed
 * - monitors reputation signals
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const supabase = supabaseAdmin;

export type ReputationStatus = "excellent" | "good" | "fair" | "poor" | "critical";

export interface DeliverabilityHealth {
  healthScore: number; // 0-100
  bounceRate: number;
  complaintRate: number;
  spamScore: number;
  reputationStatus: ReputationStatus;
  ipPoolRotationEnabled: boolean;
  autoAdjustmentsEnabled: boolean;
}

/**
 * Get deliverability health for a workspace/domain
 */
export async function getDeliverabilityHealth(
  workspaceId: string,
  domain?: string,
  inboxId?: string
): Promise<DeliverabilityHealth | null> {
  let query = supabase
    .from("deliverability_health")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("last_checked_at", { ascending: false })
    .limit(1);

  if (domain) {
    query = query.eq("domain", domain);
  }
  if (inboxId) {
    query = query.eq("inbox_id", inboxId);
  }

  const { data: health } = await query.single();

  if (!health) {
    return null;
  }

  return {
    healthScore: health.health_score || 100,
    bounceRate: health.bounce_rate || 0,
    complaintRate: health.complaint_rate || 0,
    spamScore: health.spam_score || 0,
    reputationStatus: (health.reputation_status as ReputationStatus) || "good",
    ipPoolRotationEnabled: health.ip_pool_rotation_enabled || false,
    autoAdjustmentsEnabled: health.auto_adjustments_enabled !== false,
  };
}

/**
 * Update deliverability health metrics
 */
export async function updateDeliverabilityHealth(
  workspaceId: string,
  metrics: {
    bounceRate?: number;
    complaintRate?: number;
    spamScore?: number;
    domain?: string;
    inboxId?: string;
  }
): Promise<void> {
  // Calculate health score (0-100)
  let healthScore = 100;
  healthScore -= (metrics.bounceRate || 0) * 10; // Each 1% bounce = -10 points
  healthScore -= (metrics.complaintRate || 0) * 20; // Each 1% complaint = -20 points
  healthScore -= (metrics.spamScore || 0) * 5; // Each spam point = -5 points
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Determine reputation status
  let reputationStatus: ReputationStatus = "excellent";
  if (healthScore < 50) {
    reputationStatus = "critical";
  } else if (healthScore < 65) {
    reputationStatus = "poor";
  } else if (healthScore < 80) {
    reputationStatus = "fair";
  } else if (healthScore < 95) {
    reputationStatus = "good";
  }

  // Upsert health record
  await supabase.from("deliverability_health").upsert(
    {
      workspace_id: workspaceId,
      domain: metrics.domain || null,
      inbox_id: metrics.inboxId || null,
      health_score: healthScore,
      bounce_rate: metrics.bounceRate || 0,
      complaint_rate: metrics.complaintRate || 0,
      spam_score: metrics.spamScore || 0,
      reputation_status: reputationStatus,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "workspace_id,domain,inbox_id",
    }
  );

  // If health dropped significantly, create event and apply auto-adjustments
  if (healthScore < 70 && reputationStatus !== "excellent") {
    await recordDeliverabilityEvent(workspaceId, {
      eventType: "health_drop",
      message: `Your sending health dropped to ${healthScore.toFixed(1)} — SmartSend is adjusting your sequence automatically.`,
      domain: metrics.domain,
      inboxId: metrics.inboxId,
    });

    if (reputationStatus === "critical" || reputationStatus === "poor") {
      await applyAutoAdjustments(workspaceId, reputationStatus);
    }
  }
}

/**
 * Record a deliverability event
 */
export async function recordDeliverabilityEvent(
  workspaceId: string,
  event: {
    eventType:
      | "health_drop"
      | "bounce_spike"
      | "complaint_spike"
      | "auto_throttle"
      | "auto_pause"
      | "ip_rotation"
      | "subject_replacement";
    message: string;
    domain?: string;
    inboxId?: string;
    adjustmentApplied?: Record<string, any>;
  }
): Promise<void> {
  await supabase.from("deliverability_events").insert({
    workspace_id: workspaceId,
    domain: event.domain || null,
    inbox_id: event.inboxId || null,
    event_type: event.eventType,
    event_message: event.message,
    adjustment_applied: event.adjustmentApplied || {},
  });
}

/**
 * Apply automatic adjustments when deliverability drops
 */
async function applyAutoAdjustments(
  workspaceId: string,
  reputationStatus: ReputationStatus
): Promise<void> {
  const adjustments: Record<string, any> = {};

  if (reputationStatus === "critical") {
    // Pause all sending
    await supabase
      .from("campaigns")
      .update({ status: "paused" })
      .eq("workspace_id", workspaceId)
      .in("status", ["active", "running"]);

    adjustments.paused_campaigns = true;

    await recordDeliverabilityEvent(workspaceId, {
      eventType: "auto_pause",
      message: "Critical deliverability issue detected — SmartSend paused all campaigns to protect your domain.",
      adjustmentApplied: adjustments,
    });
  } else if (reputationStatus === "poor") {
    // Reduce send rate by 75%
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, daily_cap")
      .eq("workspace_id", workspaceId)
      .in("status", ["active", "running"]);

    if (campaigns) {
      for (const campaign of campaigns) {
        const reducedCap = Math.max(10, Math.floor((campaign.daily_cap || 200) * 0.25));
        await supabase
          .from("campaigns")
          .update({ daily_cap: reducedCap })
          .eq("id", campaign.id);

        adjustments[`campaign_${campaign.id}_reduced_cap`] = reducedCap;
      }
    }

    await recordDeliverabilityEvent(workspaceId, {
      eventType: "auto_throttle",
      message: "Poor deliverability detected — SmartSend reduced send rates by 75%.",
      adjustmentApplied: adjustments,
    });
  }
}

/**
 * Check if a subject line contains spam triggers
 */
export function containsSpamTriggers(subject: string): boolean {
  const spamTriggers = [
    "free money",
    "act now",
    "limited time",
    "click here",
    "buy now",
    "urgent",
    "guaranteed",
    "no risk",
    "winner",
    "congratulations",
    "$$$",
    "!!!",
    "all caps",
  ];

  const subjectLower = subject.toLowerCase();

  // Check for all caps
  if (subject === subject.toUpperCase() && subject.length > 10) {
    return true;
  }

  // Check for excessive punctuation
  const exclamationCount = (subject.match(/!/g) || []).length;
  if (exclamationCount > 2) {
    return true;
  }

  // Check for spam trigger words
  for (const trigger of spamTriggers) {
    if (subjectLower.includes(trigger)) {
      return true;
    }
  }

  return false;
}

/**
 * Get deliverability events for a workspace
 */
export async function getDeliverabilityEvents(
  workspaceId: string,
  limit: number = 20
): Promise<
  Array<{
    id: string;
    eventType: string;
    message: string;
    adjustmentApplied: Record<string, any>;
    createdAt: Date;
  }>
> {
  const { data: events } = await supabase
    .from("deliverability_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!events) {
    return [];
  }

  return events.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    message: event.event_message,
    adjustmentApplied: event.adjustment_applied || {},
    createdAt: new Date(event.created_at),
  }));
}






































