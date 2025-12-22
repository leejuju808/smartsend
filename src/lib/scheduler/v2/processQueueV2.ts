/**
 * Block 24140 — Advanced Scheduler v2
 * Main Queue Processor — Integrates all components
 * 
 * This is the upgraded processQueue that uses:
 * - Wave-based sending
 * - AI timing windows
 * - List quality detection
 * - Prioritization
 * - Deliverability safeguards
 * - Multi-campaign load balancing
 * - Autopilot rules
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { processWave, completeWave } from "./waveSystem";
import { getNextSendTime, isWithinSendWindow, recordEngagementTiming } from "./timingWindows";
import { checkListQuality, shouldThrottleSending, getSendRateMultiplier } from "./listQuality";
import { getPrioritizedQueueItems, syncCampaignPriorities, boostStormCampaigns } from "./prioritization";
import { getDeliverabilityHealth, updateDeliverabilityHealth, containsSpamTriggers } from "./deliverability";
import { balanceCampaignLoads, canCampaignSendMore, incrementCampaignSends } from "./loadBalancing";
import { checkAllAutopilotRules } from "./autopilot";
import { gmailSendThroughWorkspace } from "@/lib/providers/gmail/send";
import { withUnsubscribeFooter } from "@/lib/email/withUnsubscribe";
import { rewriteHtmlForTracking } from "@/lib/tracking/rewriter";

const supabase = supabaseAdmin;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const TRACK_HOST = process.env.TRACK_HOST;

/**
 * Process the send queue using Advanced Scheduler v2
 */
export async function processQueueV2() {
  // Get all workspaces with active campaigns
  const { data: workspaces } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .in("status", ["active", "running"])
    .not("workspace_id", "is", null);

  if (!workspaces || workspaces.length === 0) {
    return { processed: 0, workspaces: 0 };
  }

  const uniqueWorkspaces = Array.from(
    new Set(workspaces.map((w) => w.workspace_id))
  );

  let totalProcessed = 0;

  for (const workspaceId of uniqueWorkspaces) {
    try {
      const processed = await processWorkspaceQueue(workspaceId);
      totalProcessed += processed;
    } catch (error) {
      console.error(`Error processing workspace ${workspaceId}:`, error);
    }
  }

  return { processed: totalProcessed, workspaces: uniqueWorkspaces.length };
}

/**
 * Process queue for a single workspace
 */
async function processWorkspaceQueue(workspaceId: string): Promise<number> {
  // 1. Sync campaign priorities
  await syncCampaignPriorities(workspaceId);

  // 2. Boost storm campaigns if active
  await boostStormCampaigns(workspaceId);

  // 3. Balance campaign loads
  await balanceCampaignLoads(workspaceId);

  // 4. Check list quality and throttle if needed
  const throttleCheck = await shouldThrottleSending(workspaceId);
  if (throttleCheck.throttle) {
    console.log(`Workspace ${workspaceId} throttled: ${throttleCheck.reason}`);
    return 0;
  }

  // 5. Check deliverability health
  const health = await getDeliverabilityHealth(workspaceId);
  if (health && health.reputationStatus === "critical") {
    console.log(`Workspace ${workspaceId} paused due to critical deliverability`);
    return 0;
  }

  // 6. Process wave-based sending
  const waveResult = await processWave(workspaceId);
  if (!waveResult.waveId || waveResult.emailsAssigned === 0) {
    return 0;
  }

  // 7. Get prioritized queue items for this wave
  const queueItems = await getPrioritizedQueueItems(
    workspaceId,
    waveResult.emailsAssigned
  );

  if (queueItems.length === 0) {
    await completeWave(waveResult.waveId, 0);
    return 0;
  }

  // 8. Get send rate multiplier (for throttling)
  const sendRateMultiplier = await getSendRateMultiplier(workspaceId);

  // 9. Process each email in the wave
  let sentCount = 0;
  const batchSize = Math.floor(queueItems.length * sendRateMultiplier);

  for (let i = 0; i < Math.min(batchSize, queueItems.length); i++) {
    const item = queueItems[i];
    
    try {
      const sent = await processQueueItem(item, workspaceId);
      if (sent) {
        sentCount++;
        await incrementCampaignSends(item.campaign_id);
      }
    } catch (error) {
      console.error(`Error processing queue item ${item.id}:`, error);
    }
  }

  // 10. Complete wave
  await completeWave(waveResult.waveId, sentCount);

  // 11. Update list quality metrics
  await checkListQuality(workspaceId);

  return sentCount;
}

/**
 * Process a single queue item
 */
async function processQueueItem(item: any, workspaceId: string): Promise<boolean> {
  // Check if campaign can send more today
  const canSendCheck = await canCampaignSendMore(item.campaign_id);
  if (!canSendCheck.canSend) {
    await supabase
      .from("send_queue")
      .update({
        status: "paused",
        last_error: "Daily allocation exceeded",
      })
      .eq("id", item.id);
    return false;
  }

  // Check timing window
  if (item.lead_id) {
    const withinWindow = await isWithinSendWindow(item.lead_id);
    if (!withinWindow) {
      // Reschedule for next window
      const nextSendTime = await getNextSendTime(item.lead_id);
      if (nextSendTime) {
        await supabase
          .from("send_queue")
          .update({
            scheduled_at: nextSendTime.toISOString(),
          })
          .eq("id", item.id);
      }
      return false;
    }
  }

  // Check autopilot rules
  const domain = extractDomainFromItem(item);
  const autopilotCheck = await checkAllAutopilotRules(
    item.lead_id,
    domain,
    item.subject,
    item.body_html || "",
    workspaceId
  );

  if (!autopilotCheck.allowed) {
    await supabase
      .from("send_queue")
      .update({
        status: "paused",
        last_error: autopilotCheck.reasons.join("; "),
      })
      .eq("id", item.id);
    return false;
  }

  // Check spam triggers
  if (containsSpamTriggers(item.subject)) {
    await supabase
      .from("send_queue")
      .update({
        status: "paused",
        last_error: "Subject contains spam triggers",
      })
      .eq("id", item.id);
    return false;
  }

  // Mark as sending
  await supabase
    .from("send_queue")
    .update({ status: "sending" })
    .eq("id", item.id);

  try {
    // Prepare email content
    let htmlToSend = item.body_html || "";
    const accountId = item.account_id || workspaceId;

    // Add tracking if enabled
    if (htmlToSend && TRACK_HOST && accountId) {
      const { html: trackedHtml } = await rewriteHtmlForTracking({
        accountId,
        queueId: item.id,
        html: htmlToSend,
        trackingHost: TRACK_HOST,
      });
      htmlToSend = trackedHtml;
    }

    // Add unsubscribe footer
    const finalHtml = withUnsubscribeFooter(
      htmlToSend,
      item.campaign_id,
      item.to_email
    );

    // Send email
    await gmailSendThroughWorkspace(workspaceId, {
      to: item.to_email,
      subject: item.subject,
      html: finalHtml,
      org_id: workspaceId,
      campaignId: item.campaign_id,
    });

    // Mark as sent
    await supabase
      .from("send_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempt_count: (item.attempt_count || 0) + 1,
      })
      .eq("id", item.id);

    // Record engagement timing
    if (item.lead_id) {
      await recordEngagementTiming(item.lead_id, new Date());
    }

    // Update deliverability health (simplified - would track bounces/complaints)
    await updateDeliverabilityHealth(workspaceId, {
      domain: domain,
    });

    return true;
  } catch (error: any) {
    const errorMsg = String(error?.message || "Unknown error");
    
    // Handle retries
    const attemptCount = (item.attempt_count || 0) + 1;
    const maxAttempts = 3;

    if (attemptCount < maxAttempts) {
      // Retry with exponential backoff
      const delayMs = Math.pow(2, attemptCount) * 60000; // 2min, 4min, 8min
      const nextAttempt = new Date(Date.now() + delayMs);

      await supabase
        .from("send_queue")
        .update({
          status: "pending",
          scheduled_at: nextAttempt.toISOString(),
          attempt_count: attemptCount,
          last_error: errorMsg.slice(0, 300),
        })
        .eq("id", item.id);
    } else {
      // Max attempts reached, mark as failed
      await supabase
        .from("send_queue")
        .update({
          status: "error",
          attempt_count: attemptCount,
          last_error: errorMsg.slice(0, 300),
        })
        .eq("id", item.id);
    }

    return false;
  }
}

/**
 * Extract domain from queue item (helper function)
 */
function extractDomainFromItem(item: any): string {
  // Try to get domain from various sources
  const senderEmail =
    item.sender_email ||
    item.from_email ||
    item.metadata?.sender_email ||
    "";

  if (senderEmail) {
    const domain = senderEmail.split("@")[1];
    if (domain) return domain.toLowerCase();
  }

  // Fallback: try to get from inbox
  if (item.from_inbox_id) {
    // Would need to join with sender_inboxes table
    // For now, return default
    return "unknown";
  }

  return "unknown";
}






































