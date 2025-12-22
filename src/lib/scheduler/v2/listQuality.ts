/**
 * Block 24140 — Advanced Scheduler v2
 * Component 3: List Quality Detection (Automatic Throttling)
 * 
 * If SmartSend detects:
 * - too many bounces (>5%)
 * - too many opens without replies
 * - too many non-engaged contacts
 * - old leads
 * 
 * SmartSend slows sending automatically and alerts the roofer
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const supabase = supabaseAdmin;

export type ThrottleLevel = "normal" | "limited" | "repair_mode" | "paused";

export interface ListQualityMetrics {
  bounceRate: number;
  openRate: number;
  replyRate: number;
  complaintRate: number;
  unengagedCount: number;
  oldLeadsCount: number;
  qualityScore: number; // 0-100
  throttleLevel: ThrottleLevel;
}

/**
 * Check and update list quality metrics for a workspace/campaign
 */
export async function checkListQuality(
  workspaceId: string,
  campaignId?: string
): Promise<ListQualityMetrics> {
  const checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);

  // Call database function to calculate metrics
  const { error } = await supabase.rpc("update_list_quality_metrics", {
    p_workspace_id: workspaceId,
    p_campaign_id: campaignId || null,
    p_check_date: checkDate.toISOString().split("T")[0],
  });

  if (error) {
    console.error("Error updating list quality metrics:", error);
  }

  // Fetch the updated metrics
  const { data: metrics } = await supabase
    .from("list_quality_metrics")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("metric_date", checkDate.toISOString().split("T")[0])
    .eq("campaign_id", campaignId || null)
    .order("metric_date", { ascending: false })
    .limit(1)
    .single();

  if (!metrics) {
    // Return default metrics if none found
    return {
      bounceRate: 0,
      openRate: 0,
      replyRate: 0,
      complaintRate: 0,
      unengagedCount: 0,
      oldLeadsCount: 0,
      qualityScore: 100,
      throttleLevel: "normal",
    };
  }

  return {
    bounceRate: metrics.bounce_rate || 0,
    openRate: metrics.open_rate || 0,
    replyRate: metrics.reply_rate || 0,
    complaintRate: metrics.complaint_rate || 0,
    unengagedCount: metrics.unengaged_count || 0,
    oldLeadsCount: metrics.old_leads_count || 0,
    qualityScore: metrics.quality_score || 100,
    throttleLevel: (metrics.throttle_level as ThrottleLevel) || "normal",
  };
}

/**
 * Get current throttle level for a workspace
 */
export async function getThrottleLevel(
  workspaceId: string
): Promise<ThrottleLevel> {
  const { data: metrics } = await supabase
    .from("list_quality_metrics")
    .select("throttle_level")
    .eq("workspace_id", workspaceId)
    .order("metric_date", { ascending: false })
    .limit(1)
    .single();

  return (metrics?.throttle_level as ThrottleLevel) || "normal";
}

/**
 * Check if sending should be throttled based on list quality
 */
export async function shouldThrottleSending(
  workspaceId: string
): Promise<{ throttle: boolean; reason?: string }> {
  const throttleLevel = await getThrottleLevel(workspaceId);

  if (throttleLevel === "paused") {
    return {
      throttle: true,
      reason: "List quality is poor — sending paused. SmartSend is protecting your domain reputation.",
    };
  }

  if (throttleLevel === "repair_mode") {
    return {
      throttle: true,
      reason: "High bounce rate detected — SmartSend is slowing sending to protect deliverability.",
    };
  }

  if (throttleLevel === "limited") {
    return {
      throttle: false, // Still allow sending but at reduced rate
      reason: "List quality is below optimal — SmartSend is reducing send volume.",
    };
  }

  return { throttle: false };
}

/**
 * Get list quality alerts for a workspace
 */
export async function getListQualityAlerts(workspaceId: string): Promise<
  Array<{
    id: string;
    alertType: string;
    message: string;
    severity: "info" | "warning" | "critical";
    acknowledged: boolean;
    createdAt: Date;
  }>
> {
  const { data: alerts } = await supabase
    .from("list_quality_alerts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("acknowledged_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!alerts) {
    return [];
  }

  return alerts.map((alert) => ({
    id: alert.id,
    alertType: alert.alert_type,
    message: alert.message,
    severity: alert.severity as "info" | "warning" | "critical",
    acknowledged: !!alert.acknowledged_at,
    createdAt: new Date(alert.created_at),
  }));
}

/**
 * Acknowledge a list quality alert
 */
export async function acknowledgeAlert(alertId: string): Promise<void> {
  await supabase
    .from("list_quality_alerts")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", alertId);
}

/**
 * Calculate send rate multiplier based on throttle level
 * Returns a multiplier (0.0 to 1.0) that should be applied to send rates
 */
export async function getSendRateMultiplier(
  workspaceId: string
): Promise<number> {
  const throttleLevel = await getThrottleLevel(workspaceId);

  switch (throttleLevel) {
    case "paused":
      return 0.0; // No sending
    case "repair_mode":
      return 0.25; // 25% of normal rate
    case "limited":
      return 0.5; // 50% of normal rate
    case "normal":
    default:
      return 1.0; // Full rate
  }
}






































