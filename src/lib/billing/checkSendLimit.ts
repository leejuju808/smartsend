/**
 * Check send limits before sending emails
 * This checks org-based plan limits
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { checkEmailLimit, checkDailyCap, isOrgLocked, incrementEmailUsage, incrementDailyUsage } from './enforcement';

export class SendLimitError extends Error {
  code = 'SEND_LIMIT_REACHED';
  constructor(message: string) {
    super(message);
    this.name = 'SendLimitError';
  }
}

/**
 * Check if an account/org can send emails
 * This is a legacy function that checks account-based limits
 * For org-based limits, use checkOrgEmailLimit instead
 */
export async function checkSendLimitOrThrow(
  supabase: SupabaseClient,
  accountId: string,
  emailsToSend: number = 1
): Promise<void> {
  // For now, we'll get org_id from account or workspace
  // This is a placeholder - you may need to adjust based on your schema
  const { data: account } = await supabase
    .from('accounts')
    .select('org_id, workspace_id')
    .eq('id', accountId)
    .single();

  if (!account) {
    throw new Error('Account not found');
  }

  // Try to get org_id from account, workspace, or campaign
  let orgId: string | null = account.org_id || null;

  if (!orgId && account.workspace_id) {
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('org_id')
      .eq('id', account.workspace_id)
      .single();
    orgId = workspace?.org_id || null;
  }

  if (!orgId) {
    // If no org_id found, allow sending (legacy behavior)
    // In production, you might want to block this
    console.warn('No org_id found for account, allowing send');
    return;
  }

  // Check org-based email limit
  const limitCheck = await checkEmailLimit(orgId, emailsToSend);
  
  if (!limitCheck.allowed) {
    throw new SendLimitError(
      limitCheck.message || 'Email sending limit reached for your plan'
    );
  }
}

/**
 * Check org email limit and throw if exceeded
 * Now includes account lockout and daily cap checks
 */
export async function checkOrgEmailLimit(
  orgId: string,
  emailsToSend: number = 1
): Promise<void> {
  // Check account lockout first
  const lockoutCheck = await isOrgLocked(orgId);
  if (lockoutCheck.isLocked) {
    throw new SendLimitError(
      lockoutCheck.reason === 'payment_required'
        ? 'Your SmartSend account has been locked due to payment issues. Please update your payment method to resume sending.'
        : 'Your SmartSend account has been locked.'
    );
  }

  // Check monthly email limit
  const limitCheck = await checkEmailLimit(orgId, emailsToSend);
  
  if (!limitCheck.allowed) {
    throw new SendLimitError(
      limitCheck.message || 'Email sending limit reached for your plan'
    );
  }

  // Check daily safety cap
  const dailyCheck = await checkDailyCap(orgId, emailsToSend);
  
  if (!dailyCheck.allowed) {
    throw new SendLimitError(
      dailyCheck.message || 'Daily sending limit reached. This limit resets tomorrow.'
    );
  }
}

/**
 * Increment email usage after successful send
 * Tracks both monthly and daily usage
 */
export async function recordEmailSent(orgId: string, count: number = 1): Promise<void> {
  try {
    // Increment both monthly and daily usage
    await Promise.all([
      incrementEmailUsage(orgId, count),
      incrementDailyUsage(orgId, count),
    ]);
  } catch (error) {
    console.error('Failed to record email usage:', error);
    // Don't throw - usage tracking failure shouldn't block sends
  }
}


