/**
 * Block 182: Global Send Queue Worker
 * 
 * Unified worker that processes global_send_queue with:
 * - Priority-based ordering
 * - Collision prevention
 * - Back-pressure controls
 * - Exponential backoff retries
 * - Multi-sender balancing
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeCampaignPriority } from "./campaignPriority";
import { gmailSendThroughWorkspace } from "@/lib/providers/gmail/send";
import { withUnsubscribeFooter } from "@/lib/email/withUnsubscribe";
import { rewriteHtmlForTracking } from "@/lib/tracking/rewriter";

const BATCH_SIZE = 20; // Process 20 items per run
const MAX_RETRY_ATTEMPTS = 5;

// Global throttle multiplier (0.0 to 1.0)
let GLOBAL_THROTTLE = 1.0;

/**
 * Get back-pressure throttle based on reputation score
 */
async function getBackPressureThrottle(accountId: string): Promise<number> {
  const { data: stats } = await supabaseAdmin
    .from("deliverability_stats")
    .select("reputation_score")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reputation = stats?.reputation_score ?? 100;

  if (reputation < 50) {
    // Critical: pause everything
    await pauseAllCampaigns(accountId);
    return 0;
  } else if (reputation < 60) {
    // Severe: cut to 25%
    return 0.25;
  } else if (reputation < 70) {
    // Warning: cut to 50%
    return 0.5;
  }

  return 1.0; // Normal operation
}

/**
 * Pause all campaigns for an account (back-pressure)
 */
async function pauseAllCampaigns(accountId: string): Promise<void> {
  await supabaseAdmin.rpc("pause_all_campaigns", { p_account_id: accountId });
}

/**
 * Check if lead has collision (sent in last 48 hours)
 */
async function hasCollision(leadId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("check_lead_collision", {
    p_lead_id: leadId,
  });

  return data === true;
}

/**
 * Requeue failed item with exponential backoff
 */
async function requeueWithBackoff(queueId: string): Promise<void> {
  await supabaseAdmin.rpc("requeue_with_backoff", { p_queue_id: queueId });
}

/**
 * Rotate between available senders (multi-sender balancing)
 */
async function rotateSender(accountId: string): Promise<string | null> {
  // Get available connected accounts for this workspace
  const { data: accounts } = await supabaseAdmin
    .from("connected_accounts")
    .select("id, provider, email")
    .eq("workspace_id", accountId) // Assuming account_id maps to workspace_id
    .eq("status", "active")
    .limit(10);

  if (!accounts || accounts.length === 0) {
    return null;
  }

  // Simple round-robin: get count of sends per sender today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const senderCounts = await Promise.all(
    accounts.map(async (acc) => {
      const { count } = await supabaseAdmin
        .from("email_logs")
        .select("*", { count: "exact", head: true })
        .eq("sender_id", acc.id)
        .gte("created_at", todayStart.toISOString())
        .eq("status", "sent");

      return { id: acc.id, count: count ?? 0 };
    })
  );

  // Pick sender with least sends today
  senderCounts.sort((a, b) => a.count - b.count);
  return senderCounts[0]?.id ?? null;
}

/**
 * Process a single queue item
 */
async function processQueueItem(item: any): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Check collision
    const collision = await hasCollision(item.lead_id);
    if (collision) {
      await supabaseAdmin
        .from("global_send_queue")
        .update({ status: "skipped", last_error: "collision_48h" })
        .eq("id", item.id);
      return { success: false, error: "collision_48h" };
    }

    // 2. Get lead and campaign data
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", item.lead_id)
      .single();

    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", item.campaign_id)
      .single();

    if (!lead || !campaign) {
      await supabaseAdmin
        .from("global_send_queue")
        .update({ status: "failed", last_error: "missing_lead_or_campaign" })
        .eq("id", item.id);
      return { success: false, error: "missing_lead_or_campaign" };
    }

    // 3. Get sender (rotate if multiple available)
    let senderId = item.sender_id;
    if (!senderId) {
      senderId = await rotateSender(item.account_id);
    }

    // 4. Compose email (simplified - you may need to adapt based on your email composition logic)
    const subject = (campaign as any).subject_template || campaign.name || "Hello";
    let bodyHtml = (campaign as any).body_template || "";

    // Personalize template
    bodyHtml = bodyHtml
      .replace(/\{\{first_name\}\}/g, lead.first_name || "")
      .replace(/\{\{last_name\}\}/g, lead.last_name || "")
      .replace(/\{\{company\}\}/g, lead.company || "")
      .replace(/\{\{email\}\}/g, lead.email || "");

    // Add unsubscribe footer
    bodyHtml = await withUnsubscribeFooter(bodyHtml, lead.email, item.account_id);

    // Add tracking
    bodyHtml = rewriteHtmlForTracking(bodyHtml, item.id);

    // 5. Send email (adapt based on your sending infrastructure)
    // This is a placeholder - integrate with your actual send function
    const sendResult = await sendEmail({
      to: lead.email,
      subject,
      html: bodyHtml,
      senderId,
      campaignId: item.campaign_id,
      leadId: item.lead_id,
    });

    if (sendResult.success) {
      // Mark as sent
      await supabaseAdmin
        .from("global_send_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      // Log to email_logs
      await supabaseAdmin.from("email_logs").insert({
        lead_id: item.lead_id,
        campaign_id: item.campaign_id,
        to_email: lead.email,
        subject,
        body_html: bodyHtml,
        status: "sent",
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      return { success: true };
    } else {
      // Handle failure with retry logic
      if (item.attempts < MAX_RETRY_ATTEMPTS) {
        await requeueWithBackoff(item.id);
        return { success: false, error: sendResult.error || "send_failed" };
      } else {
        await supabaseAdmin
          .from("global_send_queue")
          .update({
            status: "failed",
            last_error: sendResult.error || "max_retries_exceeded",
          })
          .eq("id", item.id);
        return { success: false, error: "max_retries_exceeded" };
      }
    }
  } catch (error: any) {
    // Handle error with retry
    if (item.attempts < MAX_RETRY_ATTEMPTS) {
      await requeueWithBackoff(item.id);
    } else {
      await supabaseAdmin
        .from("global_send_queue")
        .update({
          status: "failed",
          last_error: error.message || "unknown_error",
        })
        .eq("id", item.id);
    }
    return { success: false, error: error.message || "unknown_error" };
  }
}

/**
 * Placeholder send function - integrate with your actual sending infrastructure
 */
async function sendEmail({
  to,
  subject,
  html,
  senderId,
  campaignId,
  leadId,
}: {
  to: string;
  subject: string;
  html: string;
  senderId: string | null;
  campaignId: string;
  leadId: string;
}): Promise<{ success: boolean; error?: string }> {
  // TODO: Integrate with your actual email sending service
  // This is a placeholder that should be replaced with your send logic
  
  try {
    // Example: Use Gmail send if senderId is available
    if (senderId) {
      // Get sender account details
      const { data: sender } = await supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", senderId)
        .single();

      if (sender) {
        // Use your existing send function
        // await gmailSendThroughWorkspace(...)
        // For now, return success as placeholder
        return { success: true };
      }
    }

    return { success: false, error: "no_sender_available" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Main worker function - processes global queue
 */
export async function processGlobalQueue(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // Get accounts with pending items
  const { data: accounts } = await supabaseAdmin
    .from("global_send_queue")
    .select("account_id")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString());

  if (!accounts || accounts.length === 0) {
    return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const uniqueAccountIds = [...new Set(accounts.map((a: any) => a.account_id))];

  for (const accountId of uniqueAccountIds) {
    // Check back-pressure
    const throttle = await getBackPressureThrottle(accountId);
    if (throttle === 0) {
      continue; // Account is paused
    }

    // Block 11700: Check warmup risk before sending
    // Get sent count for today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: sentToday } = await supabaseAdmin
      .from("global_send_queue")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "sent")
      .gte("sent_at", todayStart.toISOString());

    const { checkSendRisk } = await import("@/lib/warmup/check-send-risk");
    const riskCheck = await checkSendRisk(accountId, sentToday || 0);
    
    if (!riskCheck.canSend) {
      // Pause account's queued items if risk is too high
      await supabaseAdmin
        .from("global_send_queue")
        .update({ 
          status: "paused",
          error: riskCheck.reason || "Deliverability risk too high"
        })
        .eq("account_id", accountId)
        .eq("status", "pending");
      
      console.warn(`Account ${accountId} paused due to deliverability risk: ${riskCheck.reason}`);
      continue;
    }

    // Adjust batch size based on throttle
    const effectiveBatchSize = Math.floor(BATCH_SIZE * throttle);

    // Fetch prioritized queue items
    const { data: items } = await supabaseAdmin
      .from("global_send_queue")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("priority", { ascending: false })
      .order("scheduled_at", { ascending: true })
      .limit(effectiveBatchSize);

    if (!items || items.length === 0) {
      continue;
    }

    // Mark as processing
    const itemIds = items.map((i: any) => i.id);
    await supabaseAdmin
      .from("global_send_queue")
      .update({ status: "processing" })
      .in("id", itemIds);

    // Process each item
    for (const item of items) {
      processed++;
      const result = await processQueueItem(item);

      if (result.success) {
        sent++;
      } else if (result.error === "collision_48h") {
        skipped++;
      } else {
        failed++;
      }

      // Small delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return { processed, sent, failed, skipped };
}

/**
 * Enqueue items into global queue with priority calculation
 */
export async function enqueueToGlobalQueue({
  accountId,
  campaignId,
  leadId,
  scheduledAt,
  senderId,
}: {
  accountId: string;
  campaignId: string;
  leadId: string;
  scheduledAt: Date;
  senderId?: string | null;
}): Promise<string | null> {
  // Calculate priority
  const priority = await computeCampaignPriority({
    campaign_id: campaignId,
    account_id: accountId,
  });

  // Use RPC function to enqueue with collision check
  const { data, error } = await supabaseAdmin.rpc("enqueue_global_send", {
    p_account_id: accountId,
    p_campaign_id: campaignId,
    p_lead_id: leadId,
    p_scheduled_at: scheduledAt.toISOString(),
    p_priority: priority,
    p_sender_id: senderId || null,
  });

  if (error) {
    console.error("Failed to enqueue:", error);
    return null;
  }

  return data;
}












