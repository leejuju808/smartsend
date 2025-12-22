/**
 * Block 17300 — SmartSend Billing Guard v2
 * 
 * Complete billing enforcement system that protects SmartSend revenue,
 * enforces plan limits, handles trial expiration, grace periods, and
 * provides smart upsell triggers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type PlanId = 'starter' | 'growth' | 'domination';

export type BillingAction = 
  | 'send_email'
  | 'create_campaign'
  | 'schedule_appointment'
  | 'add_team_member'
  | 'import_contacts'
  | 'run_follow_up'
  | 'ai_personalization'
  | 'advanced_automation'
  | 'revenue_dashboard'
  | 'use_scheduler'
  | 'use_inbox'
  | 'create_ai_sequence';

export interface BillingGuardResult {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
  upgradePlan?: PlanId;
  currentPlan?: PlanId;
  limitReached?: {
    type: 'campaigns' | 'emails' | 'seats' | 'feature';
    current: number;
    limit: number;
  };
  trialExpired?: boolean;
  gracePeriodActive?: boolean;
  daysUntilTrialExpires?: number;
}

export interface BillingStatus {
  billingStatus: 'active' | 'past_due' | 'grace_period' | 'locked' | 'trial_expired';
  daysSincePaymentFailed: number;
  gracePeriodEndsAt: string | null;
  canSend: boolean;
  canSchedule: boolean;
  canUseInbox: boolean;
  canCreateCampaigns: boolean;
  trialExpired: boolean;
  daysUntilTrialExpires: number;
}

export interface UsageStats {
  emailsSentThisMonth: number;
  campaignsCreated: number;
  seatsUsed: number;
  plan: PlanId;
  limits: {
    maxCampaigns: number;
    maxEmailsPerMonth: number;
    maxSeats: number;
    hasAdvancedAI: boolean;
    hasRevenueDashboard: boolean;
    hasAdvancedAutomation: boolean;
  };
}

/**
 * Get billing status with grace period and trial logic (v2)
 */
export async function getBillingStatus(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<BillingStatus | null> {
  const { data, error } = await supabase
    .rpc('get_billing_status_with_grace_period_v2', { p_owner_id: ownerId })
    .single();

  if (error || !data) {
    return null;
  }

  return {
    billingStatus: data.billing_status as BillingStatus['billingStatus'],
    daysSincePaymentFailed: data.days_since_payment_failed || 0,
    gracePeriodEndsAt: data.grace_period_ends_at,
    canSend: data.can_send || false,
    canSchedule: data.can_schedule || false,
    canUseInbox: data.can_use_inbox || false,
    canCreateCampaigns: data.can_create_campaigns || false,
    trialExpired: data.trial_expired || false,
    daysUntilTrialExpires: data.days_until_trial_expires || 0,
  };
}

/**
 * Check if user can perform a billing-guarded action (v2)
 */
export async function checkBillingGuard(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  action: BillingAction,
  metadata?: {
    emailsToSend?: number;
    campaignId?: string;
  }
): Promise<BillingGuardResult> {
  // First check billing status
  const billingStatus = await getBillingStatus(supabase, ownerId);
  
  if (!billingStatus) {
    return {
      allowed: false,
      reason: 'Unable to verify billing status. Please contact support.',
    };
  }

  // Check if trial expired
  if (billingStatus.trialExpired) {
    return {
      allowed: false,
      reason: 'Your 7-day trial has expired. Upgrade to continue using SmartSend.',
      upgradeRequired: true,
      trialExpired: true,
    };
  }

  // Check if account is locked
  if (billingStatus.billingStatus === 'locked') {
    return {
      allowed: false,
      reason: 'Your account has been locked due to payment issues. Please update your payment method to unlock all features.',
      upgradeRequired: false,
    };
  }

  // Get subscription to check plan
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trialing')) {
    return {
      allowed: false,
      reason: 'No active subscription found. Please subscribe to continue.',
      upgradeRequired: true,
    };
  }

  const plan = subscription.plan as PlanId;

  // Check action-specific limits using v2 function
  switch (action) {
    case 'create_campaign': {
      if (!billingStatus.canCreateCampaigns) {
        return {
          allowed: false,
          reason: 'Campaign creation is disabled due to payment issues. Please update your payment method.',
        };
      }

      const { data: checkResult } = await supabase
        .rpc('check_plan_limits_v2', { 
          p_owner_id: ownerId,
          p_action: 'create_campaign',
          p_count: 1
        })
        .single();

      if (!checkResult?.allowed) {
        const limits = checkResult?.limits as any;
        const usage = checkResult?.current_usage as any;
        
        return {
          allowed: false,
          reason: checkResult.reason || 'Campaign limit reached',
          upgradeRequired: true,
          upgradePlan: checkResult.upgrade_plan as PlanId | undefined,
          currentPlan: plan,
          limitReached: {
            type: 'campaigns',
            current: usage?.campaigns || 0,
            limit: limits?.max_campaigns || 0,
          },
        };
      }

      return { 
        allowed: true,
        currentPlan: plan,
        daysUntilTrialExpires: billingStatus.daysUntilTrialExpires,
      };
    }

    case 'send_email':
    case 'run_follow_up': {
      if (!billingStatus.canSend) {
        return {
          allowed: false,
          reason: 'Email sending is disabled due to payment issues. Please update your payment method.',
        };
      }

      const emailsToSend = metadata?.emailsToSend || 1;
      const { data: checkResult } = await supabase
        .rpc('check_plan_limits_v2', { 
          p_owner_id: ownerId,
          p_action: 'send_email',
          p_count: emailsToSend
        })
        .single();

      if (!checkResult?.allowed) {
        const limits = checkResult?.limits as any;
        const usage = checkResult?.current_usage as any;
        
        return {
          allowed: false,
          reason: checkResult.reason || 'Email limit reached',
          upgradeRequired: true,
          upgradePlan: checkResult.upgrade_plan as PlanId | undefined,
          currentPlan: plan,
          limitReached: {
            type: 'emails',
            current: usage?.emails_sent || 0,
            limit: limits?.max_emails_per_month || 0,
          },
        };
      }

      return { 
        allowed: true,
        currentPlan: plan,
        daysUntilTrialExpires: billingStatus.daysUntilTrialExpires,
      };
    }

    case 'schedule_appointment':
    case 'use_scheduler': {
      if (!billingStatus.canSchedule) {
        return {
          allowed: false,
          reason: 'Scheduler is disabled due to payment issues. Please update your payment method.',
        };
      }
      return { 
        allowed: true,
        currentPlan: plan,
      };
    }

    case 'use_inbox': {
      if (!billingStatus.canUseInbox) {
        return {
          allowed: false,
          reason: 'Inbox replies are disabled due to payment issues. Please update your payment method.',
        };
      }
      return { 
        allowed: true,
        currentPlan: plan,
      };
    }

    case 'advanced_automation':
    case 'revenue_dashboard': {
      // Check if plan has these features
      const { data: planLimits } = await supabase
        .from('plan_limits')
        .select('has_advanced_automation, has_revenue_dashboard')
        .eq('plan', plan)
        .single();

      if (action === 'advanced_automation' && !planLimits?.has_advanced_automation) {
        return {
          allowed: false,
          reason: 'Advanced automation is only available on Growth and Domination plans.',
          upgradeRequired: true,
          upgradePlan: plan === 'starter' ? 'growth' : 'domination',
          currentPlan: plan,
        };
      }

      if (action === 'revenue_dashboard' && !planLimits?.has_revenue_dashboard) {
        return {
          allowed: false,
          reason: 'Revenue dashboard is only available on Domination plan.',
          upgradeRequired: true,
          upgradePlan: 'domination',
          currentPlan: plan,
        };
      }

      return { 
        allowed: true,
        currentPlan: plan,
      };
    }

    case 'ai_personalization':
      // Basic AI is available on all plans, advanced AI requires Growth+
      return { 
        allowed: true,
        currentPlan: plan,
      };

    case 'add_team_member': {
      const { data: checkResult } = await supabase
        .rpc('check_plan_limits_v2', { 
          p_owner_id: ownerId,
          p_action: 'add_team_member',
          p_count: 1
        })
        .single();

      if (!checkResult?.allowed) {
        const limits = checkResult?.limits as any;
        const usage = checkResult?.current_usage as any;
        
        return {
          allowed: false,
          reason: checkResult.reason || 'Seat limit reached',
          upgradeRequired: true,
          upgradePlan: checkResult.upgrade_plan as PlanId | undefined,
          currentPlan: plan,
          limitReached: {
            type: 'seats',
            current: usage?.seats_used || 0,
            limit: limits?.max_seats || 0,
          },
        };
      }

      return { 
        allowed: true,
        currentPlan: plan,
      };
    }

    case 'import_contacts':
    case 'create_ai_sequence':
      // These are allowed on all plans (may have limits in future)
      return { 
        allowed: true,
        currentPlan: plan,
      };

    default:
      return { 
        allowed: true,
        currentPlan: plan,
      };
  }
}

/**
 * Increment email usage after successful send
 */
export async function incrementEmailUsage(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  count: number = 1
): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Use RPC function if available, otherwise use upsert with increment
  const { data: existing } = await supabase
    .from('billing_usage')
    .select('emails_sent')
    .eq('owner_id', ownerId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('billing_usage')
      .update({
        emails_sent: existing.emails_sent + count,
      })
      .eq('owner_id', ownerId)
      .eq('year', year)
      .eq('month', month);
  } else {
    await supabase
      .from('billing_usage')
      .insert({
        owner_id: ownerId,
        year,
        month,
        emails_sent: count,
      });
  }
}

/**
 * Get current usage stats for a user (v2)
 */
export async function getUsageStats(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<UsageStats | null> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Get email usage
  const { data: emailUsage } = await supabase
    .from('billing_usage')
    .select('emails_sent, campaigns_created, seats_used')
    .eq('owner_id', ownerId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  // Get campaign count
  const { count: campaignCount } = await supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId);

  // Get plan and limits
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (!subscription) {
    return null;
  }

  const plan = subscription.plan as PlanId;

  // Get plan limits
  const { data: planLimits } = await supabase
    .from('plan_limits')
    .select('*')
    .eq('plan', plan)
    .single();

  if (!planLimits) {
    return null;
  }

  return {
    emailsSentThisMonth: emailUsage?.emails_sent || 0,
    campaignsCreated: campaignCount || 0,
    seatsUsed: emailUsage?.seats_used || 0,
    plan,
    limits: {
      maxCampaigns: planLimits.max_campaigns,
      maxEmailsPerMonth: planLimits.max_emails_per_month,
      maxSeats: planLimits.max_seats || 1,
      hasAdvancedAI: planLimits.has_advanced_ai || false,
      hasRevenueDashboard: planLimits.has_revenue_dashboard || false,
      hasAdvancedAutomation: planLimits.has_advanced_automation || false,
    },
  };
}

/**
 * Check if trial has expired (v2)
 */
export async function checkTrialExpiration(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<{
  isExpired: boolean;
  trialEndsAt: string | null;
  daysRemaining: number;
  shouldLock: boolean;
} | null> {
  const { data, error } = await supabase
    .rpc('check_trial_expiration', { p_owner_id: ownerId })
    .single();

  if (error || !data) {
    return null;
  }

  return {
    isExpired: data.is_expired || false,
    trialEndsAt: data.trial_ends_at,
    daysRemaining: data.days_remaining || 0,
    shouldLock: data.should_lock || false,
  };
}

/**
 * Lock features on trial expiration (v2)
 */
export async function lockFeaturesOnTrialExpired(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<void> {
  await supabase.rpc('lock_features_on_trial_expired', {
    p_owner_id: ownerId,
  });
}

/**
 * Start grace period on payment failure (v2)
 */
export async function startGracePeriod(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<void> {
  await supabase.rpc('start_grace_period', {
    p_owner_id: ownerId,
  });
}

/**
 * Resolve grace period on payment success (v2)
 */
export async function resolveGracePeriod(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<void> {
  await supabase.rpc('resolve_grace_period', {
    p_owner_id: ownerId,
  });
}

/**
 * Get smart upsell trigger suggestions
 */
export async function getUpsellTriggers(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<Array<{
  type: 'limit_approaching' | 'limit_reached' | 'feature_unlocked' | 'trial_expiring';
  message: string;
  upgradePlan: PlanId;
  urgency: 'low' | 'medium' | 'high';
}> | null> {
  const usageStats = await getUsageStats(supabase, ownerId);
  const billingStatus = await getBillingStatus(supabase, ownerId);

  if (!usageStats || !billingStatus) {
    return null;
  }

  const triggers: Array<{
    type: 'limit_approaching' | 'limit_reached' | 'feature_unlocked' | 'trial_expiring';
    message: string;
    upgradePlan: PlanId;
    urgency: 'low' | 'medium' | 'high';
  }> = [];

  // Check trial expiration
  if (billingStatus.daysUntilTrialExpires > 0 && billingStatus.daysUntilTrialExpires <= 2) {
    triggers.push({
      type: 'trial_expiring',
      message: `Your trial expires in ${billingStatus.daysUntilTrialExpires} day${billingStatus.daysUntilTrialExpires > 1 ? 's' : ''}. Upgrade now to keep SmartSend running.`,
      upgradePlan: 'starter',
      urgency: 'high',
    });
  }

  // Check email limit
  const emailUsagePercent = (usageStats.emailsSentThisMonth / usageStats.limits.maxEmailsPerMonth) * 100;
  if (emailUsagePercent >= 100) {
    triggers.push({
      type: 'limit_reached',
      message: `You've reached your email limit (${usageStats.emailsSentThisMonth}/${usageStats.limits.maxEmailsPerMonth}). Upgrade to continue reaching homeowners.`,
      upgradePlan: usageStats.plan === 'starter' ? 'growth' : 'domination',
      urgency: 'high',
    });
  } else if (emailUsagePercent >= 82) {
    triggers.push({
      type: 'limit_approaching',
      message: `You're at ${Math.round(emailUsagePercent)}% of your send limit. Upgrade now to continue reaching homeowners.`,
      upgradePlan: usageStats.plan === 'starter' ? 'growth' : 'domination',
      urgency: 'medium',
    });
  }

  // Check campaign limit
  if (usageStats.campaignsCreated >= usageStats.limits.maxCampaigns) {
    triggers.push({
      type: 'limit_reached',
      message: `You've reached your campaign limit (${usageStats.campaignsCreated}/${usageStats.limits.maxCampaigns}). Upgrade to run more campaigns.`,
      upgradePlan: usageStats.plan === 'starter' ? 'growth' : 'domination',
      urgency: 'high',
    });
  }

  return triggers.length > 0 ? triggers : null;
}
