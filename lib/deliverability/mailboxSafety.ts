// lib/deliverability/mailboxSafety.ts
// Mailbox safety checks and limit enforcement

import { createClient } from '@supabase/supabase-js';
import { getEffectiveDailyLimit } from './warmupCurve';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  }
);

export interface MailboxSafetyCheck {
  canSend: boolean;
  reason?: string;
  currentLimit?: number;
  sendsUsed?: number;
  warmupLevel?: number;
  reputationScore?: number;
}

/**
 * Get mailbox with safety metadata
 */
export async function getMailbox(mailboxId: string) {
  const { data, error } = await supabase
    .from('mailboxes')
    .select('*')
    .eq('id', mailboxId)
    .single();

  if (error || !data) {
    throw new Error(`Mailbox not found: ${mailboxId}`);
  }

  return data;
}

/**
 * Check if mailbox can send based on all safety rules
 */
export async function checkMailboxSafety(
  mailboxId: string
): Promise<MailboxSafetyCheck> {
  // Use database function for atomic check
  const { data, error } = await supabase.rpc('can_mailbox_send', {
    p_mailbox_id: mailboxId,
  });

  if (error) {
    console.error('Error checking mailbox safety:', error);
    return { canSend: false, reason: 'check_failed' };
  }

  const result = data?.[0];
  if (!result) {
    return { canSend: false, reason: 'mailbox_not_found' };
  }

  return {
    canSend: result.can_send,
    reason: result.reason,
    currentLimit: result.current_limit,
    sendsUsed: result.sends_used,
  };
}

/**
 * Check if mailbox has reached daily limit
 */
export async function isDailyLimitReached(
  mailboxId: string
): Promise<boolean> {
  const mailbox = await getMailbox(mailboxId);
  
  const effectiveLimit = getEffectiveDailyLimit(
    mailbox.send_limit_daily || 200,
    mailbox.warmup_active ?? true,
    mailbox.warmup_level || 1
  );

  return (mailbox.sends_today || 0) >= effectiveLimit;
}

/**
 * Check if mailbox is paused due to bounce rate
 */
export async function isMailboxPaused(mailboxId: string): Promise<boolean> {
  const mailbox = await getMailbox(mailboxId);
  return mailbox.paused === true;
}

/**
 * Check bounce rate and pause if needed
 */
export async function checkBounceRate(mailboxId: string): Promise<boolean> {
  const mailbox = await getMailbox(mailboxId);
  
  if (!mailbox.sends_today || mailbox.sends_today === 0) {
    return false; // No sends, no bounce rate to check
  }

  const bounceRate = (mailbox.bounces_today || 0) / mailbox.sends_today;
  
  if (bounceRate > 0.05) {
    // Pause mailbox
    await supabase
      .from('mailboxes')
      .update({ paused: true })
      .eq('id', mailboxId);
    
    return true; // Was paused
  }

  return false; // Not paused
}

/**
 * Record a bounce event
 */
export async function recordBounce(
  mailboxId: string,
  options: {
    leadId?: string;
    campaignId?: string;
    email: string;
    bounceType: 'hard' | 'soft' | 'complaint';
    reason?: string;
  }
): Promise<void> {
  // Insert bounce event
  await supabase.from('bounce_events').insert({
    mailbox_id: mailboxId,
    lead_id: options.leadId,
    campaign_id: options.campaignId,
    email: options.email,
    bounce_type: options.bounceType,
    bounce_reason: options.reason,
  });

  // Increment bounce counter
  await supabase.rpc('increment_mailbox_bounces', {
    p_mailbox_id: mailboxId,
    p_increment: 1,
  });

  // Check and pause if needed
  await checkBounceRate(mailboxId);
}

/**
 * Record a successful send
 */
export async function recordSend(mailboxId: string): Promise<void> {
  await supabase.rpc('increment_mailbox_sends', {
    p_mailbox_id: mailboxId,
    p_increment: 1,
  });
}










