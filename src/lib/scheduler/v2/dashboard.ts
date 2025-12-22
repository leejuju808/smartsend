/**
 * Block 24140 — Advanced Scheduler v2
 * Component 8: Internal Dashboard Metrics
 * 
 * For YOU, the builder, SmartSend should display:
 * - Emails in Queue
 * - Next Wave Scheduled At
 * - Throttle Status: Normal / Limited / Repair Mode
 * - Deliverability Score
 * - Engagement Trend
 * - Storm Priority Active: YES/NO
 * - List Quality Rating
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const supabase = supabaseAdmin;

export interface SchedulerDashboardMetrics {
  emailsInQueue: number;
  nextWaveScheduledAt: Date | null;
  throttleStatus: "normal" | "limited" | "repair_mode" | "paused";
  deliverabilityScore: number;
  engagementTrend7d: number;
  stormPriorityActive: boolean;
  listQualityRating: number;
}

/**
 * Get scheduler dashboard metrics for a workspace
 */
export async function getSchedulerDashboard(
  workspaceId: string
): Promise<SchedulerDashboardMetrics> {
  // Use the database view
  const { data: dashboard } = await supabase
    .from("v_scheduler_dashboard")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (!dashboard) {
    // Return default metrics if not found
    return {
      emailsInQueue: 0,
      nextWaveScheduledAt: null,
      throttleStatus: "normal",
      deliverabilityScore: 100,
      engagementTrend7d: 0,
      stormPriorityActive: false,
      listQualityRating: 100,
    };
  }

  return {
    emailsInQueue: dashboard.emails_in_queue || 0,
    nextWaveScheduledAt: dashboard.next_wave_scheduled_at
      ? new Date(dashboard.next_wave_scheduled_at)
      : null,
    throttleStatus:
      (dashboard.throttle_status as
        | "normal"
        | "limited"
        | "repair_mode"
        | "paused") || "normal",
    deliverabilityScore: dashboard.deliverability_score || 100,
    engagementTrend7d: dashboard.engagement_trend_7d || 0,
    stormPriorityActive: dashboard.storm_priority_active || false,
    listQualityRating: dashboard.list_quality_rating || 100,
  };
}

/**
 * Get detailed queue statistics
 */
export async function getQueueStats(workspaceId: string): Promise<{
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  byCampaignType: Record<string, number>;
}> {
  const { data: queueItems } = await supabase
    .from("send_queue")
    .select(`
      status,
      campaigns!inner(workspace_id, campaign_type)
    `)
    .eq("campaigns.workspace_id", workspaceId);

  if (!queueItems) {
    return {
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      byCampaignType: {},
    };
  }

  const stats = {
    pending: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    byCampaignType: {} as Record<string, number>,
  };

  for (const item of queueItems) {
    const status = item.status;
    const campaignType =
      (item.campaigns as any)?.campaign_type || "other";

    if (status === "pending") stats.pending++;
    else if (status === "sending" || status === "picked") stats.sending++;
    else if (status === "sent") stats.sent++;
    else if (status === "error" || status === "failed") stats.failed++;

    stats.byCampaignType[campaignType] =
      (stats.byCampaignType[campaignType] || 0) + 1;
  }

  return stats;
}

/**
 * Get wave statistics for a workspace
 */
export async function getWaveStats(workspaceId: string): Promise<{
  wavesToday: number;
  emailsSentToday: number;
  averageWaveSize: number;
  nextWaveAt: Date | null;
}> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: wavesToday } = await supabase
    .from("send_waves")
    .select("emails_sent, batch_size")
    .eq("workspace_id", workspaceId)
    .gte("started_at", todayStart.toISOString());

  const waves = wavesToday || [];
  const emailsSentToday = waves.reduce(
    (sum, w) => sum + (w.emails_sent || 0),
    0
  );
  const averageWaveSize =
    waves.length > 0
      ? waves.reduce((sum, w) => sum + (w.batch_size || 0), 0) / waves.length
      : 0;

  // Get next wave time (from next pending queue item)
  const { data: nextQueueItem } = await supabase
    .from("send_queue")
    .select("scheduled_at, campaigns!inner(workspace_id)")
    .eq("campaigns.workspace_id", workspaceId)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .single();

  return {
    wavesToday: waves.length,
    emailsSentToday: emailsSentToday,
    averageWaveSize: averageWaveSize,
    nextWaveAt: nextQueueItem?.scheduled_at
      ? new Date(nextQueueItem.scheduled_at)
      : null,
  };
}






































