/**
 * Block 9100 — Billing Guard v1
 * Enforces plan limits and feature access for accounts table
 */

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';

export interface BillingGuardResult {
  allowed: boolean;
  response?: NextResponse;
  reason?: string;
  currentCount?: number;
  maxAllowed?: number;
  plan?: string;
}

/**
 * Ensure account can send emails (checks monthly limit)
 */
export async function ensureCanSendEmail(
  accountId: string,
  emailsToSend: number = 1
): Promise<BillingGuardResult> {
  const supabase = createSupabaseServer();

  // Call database function to check if sending is allowed
  const { data, error } = await supabase.rpc('can_send_emails', {
    p_account_id: accountId,
    p_emails_to_send: emailsToSend,
  });

  if (error) {
    console.error('Error checking email send limit:', error);
    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'BILLING_CHECK_FAILED', message: 'Failed to verify billing status' },
        { status: 500 }
      ),
    };
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result?.allowed) {
    const plan = result?.plan || 'starter';
    const message = result?.reason === 'account_locked'
      ? 'Your account has been locked due to payment issues. Please update your payment method to resume sending.'
      : `You've reached your ${plan} plan email limit (${result?.maxAllowed || 0} emails/month). Upgrade to send more.`;

    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: result?.reason?.toUpperCase() || 'EMAIL_LIMIT_EXCEEDED',
          message,
          currentCount: result?.current_count || 0,
          maxAllowed: result?.max_allowed || 0,
          remaining: result?.remaining || 0,
          plan,
          upgradeRequired: true,
        },
        { status: 403 }
      ),
      reason: result?.reason,
      currentCount: result?.current_count,
      maxAllowed: result?.max_allowed,
      plan,
    };
  }

  return { allowed: true };
}

/**
 * Ensure account can create a new campaign
 */
export async function ensureCanCreateCampaign(
  accountId: string
): Promise<BillingGuardResult> {
  const supabase = createSupabaseServer();

  // Call database function to check if campaign creation is allowed
  const { data, error } = await supabase.rpc('can_create_campaign', {
    p_account_id: accountId,
  });

  if (error) {
    console.error('Error checking campaign limit:', error);
    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'BILLING_CHECK_FAILED', message: 'Failed to verify billing status' },
        { status: 500 }
      ),
    };
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result?.allowed) {
    const plan = result?.plan || 'starter';
    const message = result?.reason === 'account_locked'
      ? 'Your account has been locked due to payment issues. Please update your payment method to create campaigns.'
      : `Your ${plan} plan allows ${result?.max_allowed || 1} active campaign${result?.max_allowed === 1 ? '' : 's'}. Upgrade to add more campaigns.`;

    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: result?.reason?.toUpperCase() || 'CAMPAIGN_LIMIT_EXCEEDED',
          message,
          currentCount: result?.current_count || 0,
          maxAllowed: result?.max_allowed || 1,
          plan,
          upgradeRequired: true,
        },
        { status: 403 }
      ),
      reason: result?.reason,
      currentCount: result?.current_count,
      maxAllowed: result?.max_allowed,
      plan,
    };
  }

  return { allowed: true };
}

/**
 * Require feature access (e.g., follow_up_brain, revenue_dashboard)
 */
export async function requireFeature(
  accountId: string,
  featureName: string
): Promise<BillingGuardResult> {
  const supabase = createSupabaseServer();

  // Call database function to check feature access
  const { data, error } = await supabase.rpc('has_feature', {
    p_account_id: accountId,
    p_feature_name: featureName,
  });

  if (error) {
    console.error('Error checking feature access:', error);
    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'BILLING_CHECK_FAILED', message: 'Failed to verify feature access' },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    // Get account plan to show upgrade message
    const { data: account } = await supabase
      .from('accounts')
      .select('current_plan')
      .eq('id', accountId)
      .single();

    const plan = account?.current_plan || 'starter';
    const featureDisplayName = featureName === 'follow_up_brain'
      ? 'Follow-Up Brain'
      : featureName === 'revenue_dashboard'
      ? 'Revenue Dashboard'
      : featureName;

    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'FEATURE_NOT_AVAILABLE',
          message: `${featureDisplayName} is not available on your ${plan} plan. Upgrade to access this feature.`,
          plan,
          feature: featureName,
          upgradeRequired: true,
        },
        { status: 403 }
      ),
      reason: 'feature_not_available',
      plan,
    };
  }

  return { allowed: true };
}

/**
 * Track email usage after successful send
 */
export async function trackEmailUsage(
  accountId: string,
  count: number = 1
): Promise<void> {
  const supabase = createSupabaseServer();

  try {
    await supabase.rpc('increment_email_usage', {
      p_account_id: accountId,
      p_count: count,
    });
  } catch (error) {
    console.error('Failed to track email usage:', error);
    // Don't throw - usage tracking failure shouldn't block sends
  }
}

/**
 * Get account billing status
 */
export async function getAccountBillingStatus(accountId: string) {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from('accounts')
    .select(
      'id, current_plan, plan_email_limit, plan_campaign_limit, plan_features, email_usage_month, email_usage_reset_at, stripe_customer_id, stripe_subscription_id, subscription_status'
    )
    .eq('id', accountId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    accountId: data.id,
    plan: data.current_plan,
    emailLimit: data.plan_email_limit,
    campaignLimit: data.plan_campaign_limit,
    features: data.plan_features || {},
    emailUsage: data.email_usage_month || 0,
    emailUsageResetAt: data.email_usage_reset_at,
    stripeCustomerId: data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    subscriptionStatus: data.subscription_status,
    isLocked: data.current_plan === 'locked',
  };
}
























































