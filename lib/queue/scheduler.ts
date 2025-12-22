/**
 * Block 10700 — SmartSend Scheduler & Send Queue v1
 * Helper functions for scheduling campaigns and managing the send queue
 */

import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScheduleMessageParams {
  userId: string;
  campaignId: string;
  contactId: string;
  messageBody: string;
  subject?: string;
  sequenceStep: number; // 1, 2, or 3
  stepLabel?: string; // 'initial', 'followup-1', 'followup-2'
  sendAt: Date;
}

export interface CampaignSequence {
  step1: { subject: string; body: string };
  step2: { subject: string; body: string };
  step3: { subject: string; body: string };
}

/**
 * Add a message to the send queue
 */
export async function addToQueue(
  supabase: SupabaseClient,
  params: ScheduleMessageParams
): Promise<{ id: string; error?: string }> {
  const { data, error } = await supabase
    .from("send_queue")
    .insert({
      user_id: params.userId,
      campaign_id: params.campaignId,
      contact_id: params.contactId,
      message_body: params.messageBody,
      subject: params.subject,
      sequence_step: params.sequenceStep,
      step_label: params.stepLabel || `step-${params.sequenceStep}`,
      send_at: params.sendAt.toISOString(),
      sent: false,
      status: "queued",
      attempts: 0,
    })
    .select("id")
    .single();

  if (error) {
    return { id: "", error: error.message };
  }

  return { id: data.id };
}

/**
 * Schedule all messages for a campaign
 * Creates queue entries for Message 1 (immediate), Message 2 (2 days), Message 3 (4 days)
 */
export async function scheduleCampaign(
  supabase: SupabaseClient,
  params: {
    userId: string;
    campaignId: string;
    contactIds: string[];
    sequence: CampaignSequence;
    startTime?: Date;
  }
): Promise<{ scheduled: number; errors: string[] }> {
  const errors: string[] = [];
  let scheduled = 0;
  const startTime = params.startTime || new Date();

  for (const contactId of params.contactIds) {
    // Check if sequence should continue for this contact
    const shouldContinue = await checkSequenceShouldContinue(
      supabase,
      params.campaignId,
      contactId
    );

    if (!shouldContinue) {
      continue; // Skip this contact (already replied, stopped, etc.)
    }

    // Message 1: Send immediately
    const step1Result = await addToQueue(supabase, {
      userId: params.userId,
      campaignId: params.campaignId,
      contactId,
      messageBody: params.sequence.step1.body,
      subject: params.sequence.step1.subject,
      sequenceStep: 1,
      stepLabel: "initial",
      sendAt: startTime,
    });

    if (step1Result.error) {
      errors.push(`Contact ${contactId} step 1: ${step1Result.error}`);
    } else {
      scheduled++;
    }

    // Message 2: Send after 2 days (only if no reply)
    const step2Time = new Date(startTime);
    step2Time.setDate(step2Time.getDate() + 2);

    const step2Result = await addToQueue(supabase, {
      userId: params.userId,
      campaignId: params.campaignId,
      contactId,
      messageBody: params.sequence.step2.body,
      subject: params.sequence.step2.subject,
      sequenceStep: 2,
      stepLabel: "followup-1",
      sendAt: step2Time,
    });

    if (step2Result.error) {
      errors.push(`Contact ${contactId} step 2: ${step2Result.error}`);
    } else {
      scheduled++;
    }

    // Message 3: Send after 4 days (only if no reply)
    const step3Time = new Date(startTime);
    step3Time.setDate(step3Time.getDate() + 4);

    const step3Result = await addToQueue(supabase, {
      userId: params.userId,
      campaignId: params.campaignId,
      contactId,
      messageBody: params.sequence.step3.body,
      subject: params.sequence.step3.subject,
      sequenceStep: 3,
      stepLabel: "followup-2",
      sendAt: step3Time,
    });

    if (step3Result.error) {
      errors.push(`Contact ${contactId} step 3: ${step3Result.error}`);
    } else {
      scheduled++;
    }
  }

  return { scheduled, errors };
}

/**
 * Check if sequence should continue for a contact
 * Returns false if contact has replied, is stopped, or marked as not interested
 */
async function checkSequenceShouldContinue(
  supabase: SupabaseClient,
  campaignId: string,
  contactId: string
): Promise<boolean> {
  // Check if contact has replied
  const { data: hasReply } = await supabase
    .from("activity_logs")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("contact_id", contactId)
    .eq("event_type", "reply_received")
    .limit(1)
    .maybeSingle();

  if (hasReply) {
    return false;
  }

  // Check campaign_contacts status if table exists
  const { data: campaignContact } = await supabase
    .from("campaign_contacts")
    .select("status")
    .eq("campaign_id", campaignId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (campaignContact) {
    const status = campaignContact.status;
    if (status && ["stopped", "paused", "not_interested", "hot", "warm"].includes(status)) {
      return false;
    }
  }

  return true;
}

/**
 * Send an email via provider
 * This integrates with existing email sending infrastructure
 */
export async function sendEmail(
  supabase: SupabaseClient,
  params: {
    queueId: string;
    to: string;
    subject: string;
    html: string;
    fromEmail?: string;
    fromName?: string;
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Get campaign info for sender account
    const { data: queueItem } = await supabase
      .from("send_queue")
      .select("campaign_id, user_id")
      .eq("id", params.queueId)
      .single();

    if (!queueItem) {
      return { success: false, error: "Queue item not found" };
    }

    // Get campaign to find sender account
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("sender_account_id, from_email, from_name")
      .eq("id", queueItem.campaign_id)
      .single();

    if (!campaign) {
      return { success: false, error: "Campaign not found" };
    }

    // Use existing email sending infrastructure
    // Try to use sendWithSender or similar function
    try {
      // Check if sendDispatch exists
      const sendDispatchModule = await import("@/lib/sendDispatch").catch(() => null);
      if (sendDispatchModule?.sendWithSender) {
        const result = await sendDispatchModule.sendWithSender({
          senderAccountId: campaign.sender_account_id,
          to: params.to,
          subject: params.subject,
          textOrHtml: params.html,
          campaignId: queueItem.campaign_id,
          leadId: null, // We're using contact_id instead
        });

        return {
          success: true,
          messageId: result.messageId || result.headers?.["Message-Id"] || undefined,
        };
      }
      throw new Error("sendWithSender not available");
    } catch (importError) {
      // Fallback: use providerSend if available
      try {
        const { providerSend } = await import("@/lib/providers");
        
        // Get email account
        if (!campaign.sender_account_id) {
          return { success: false, error: "No sender account configured" };
        }

        const { data: account } = await supabase
          .from("email_accounts")
          .select("provider, smtp_settings")
          .eq("id", campaign.sender_account_id)
          .single();

        if (!account) {
          return { success: false, error: "Email account not found" };
        }

        const result = await providerSend(account, {
          to: params.to,
          subject: params.subject,
          html: params.html,
          from: params.fromEmail || campaign.from_email,
        });

        if (result.ok) {
          return { success: true, messageId: result.messageId };
        } else {
          return { success: false, error: result.error };
        }
      } catch (providerError) {
        // Last resort: basic SMTP or log error
        console.error("Email sending failed:", providerError);
        return {
          success: false,
          error: `Email sending failed: ${providerError instanceof Error ? providerError.message : String(providerError)}`,
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Log an event to activity_logs
 */
export async function logEvent(
  supabase: SupabaseClient,
  params: {
    userId: string;
    campaignId: string;
    contactId?: string;
    eventType: string;
    message?: string;
    meta?: Record<string, any>;
  }
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("activity_logs").insert({
    user_id: params.userId,
    campaign_id: params.campaignId,
    contact_id: params.contactId || null,
    event_type: params.eventType,
    message: params.message || null,
    meta: params.meta || {},
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Check safety rules before sending
 * Returns true if safe to send, false if should pause/skip
 */
export async function checkSafetyRules(
  supabase: SupabaseClient,
  userId: string,
  campaignId?: string
): Promise<{ safe: boolean; reason?: string }> {
  // Get safety rules for user/campaign
  const query = supabase
    .from("send_safety_rules")
    .select("*")
    .eq("user_id", userId);

  if (campaignId) {
    query.eq("campaign_id", campaignId);
  }

  const { data: rules } = await query.maybeSingle();

  if (!rules) {
    // No rules = safe to send (use defaults)
    return { safe: true };
  }

  // Check if paused
  if (rules.is_paused) {
    return { safe: false, reason: rules.pause_reason || "Campaign paused" };
  }

  // Check bounce/complaint rates (would need to query send_logs)
  // This is a simplified check - in production, you'd calculate actual rates
  // For now, just return safe
  return { safe: true };
}

/**
 * Apply random delay between emails (6-18 seconds)
 */
export function getRandomDelay(): number {
  const min = 6;
  const max = 18;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Check rate limit (max 60 sends per hour)
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; remaining?: number }> {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const { count } = await supabase
    .from("send_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("sent", true)
    .gte("sent_at", oneHourAgo.toISOString());

  const maxPerHour = 60;
  const sent = count || 0;
  const remaining = Math.max(0, maxPerHour - sent);

  return {
    allowed: sent < maxPerHour,
    remaining,
  };
}

