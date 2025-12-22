/**
 * Plan Enforcement Utilities
 * Functions to check and enforce plan limits
 */

import { createSupabaseServer } from '@/lib/supabaseServer';

export interface PlanCheckResult {
  allowed: boolean;
  reason?: 'campaign_limit' | 'email_limit' | 'daily_limit' | 'subscription_inactive' | 'account_locked' | 'feature_access' | 'unknown_action';
  currentCount?: number;
  maxAllowed?: number | null;
  plan?: string;
  message?: string;
  upgradeRequired?: boolean;
}

export type PlanAction = 
  | 'create_campaign' 
  | 'send_email' 
  | 'access_revenue_dashboard' 
  | 'access_advanced_ai' 
  | 'access_pipeline'
  | 'access_multi_identity_rotation'
  | 'access_snooze';

/**
 * Check if org can create/activate a campaign
 */
export async function checkCampaignLimit(orgId: string): Promise<PlanCheckResult> {
  const supabase = createSupabaseServer();

  try {
    const { data, error } = await supabase.rpc('can_org_create_campaign', {
      p_org_id: orgId,
    });

    if (error) {
      console.error('Error checking campaign limit:', error);
      return {
        allowed: false,
        reason: 'campaign_limit',
        message: 'Unable to verify campaign limit',
      };
    }

    const result = data?.[0];
    if (!result) {
      return {
        allowed: false,
        reason: 'campaign_limit',
        message: 'Unable to verify campaign limit',
      };
    }

    if (!result.allowed) {
      const planName = result.plan === 'trial' ? 'Trial' : 
                      result.plan === 'starter' ? 'Starter' :
                      result.plan === 'growth' ? 'Growth' : 'Domination';
      
      return {
        allowed: false,
        reason: 'campaign_limit',
        currentCount: result.current_count,
        maxAllowed: result.max_allowed,
        plan: result.plan,
        message: `Your ${planName} plan allows ${result.max_allowed} active campaign${result.max_allowed === 1 ? '' : 's'}. ${result.max_allowed === null ? 'Upgrade to unlock higher campaign limits.' : 'Upgrade to increase your limit.'}`,
      };
    }

    return {
      allowed: true,
      currentCount: result.current_count,
      maxAllowed: result.max_allowed,
      plan: result.plan,
    };
  } catch (error: any) {
    console.error('Error checking campaign limit:', error);
    return {
      allowed: false,
      reason: 'campaign_limit',
      message: 'Error checking campaign limit',
    };
  }
}

/**
 * Check if org can send emails
 */
export async function checkEmailLimit(
  orgId: string,
  emailsToSend: number = 1
): Promise<PlanCheckResult> {
  const supabase = createSupabaseServer();

  try {
    const { data, error } = await supabase.rpc('can_org_send_emails', {
      p_org_id: orgId,
      p_emails_to_send: emailsToSend,
    });

    if (error) {
      console.error('Error checking email limit:', error);
      return {
        allowed: false,
        reason: 'email_limit',
        message: 'Unable to verify email limit',
      };
    }

    const result = data?.[0];
    if (!result) {
      return {
        allowed: false,
        reason: 'email_limit',
        message: 'Unable to verify email limit',
      };
    }

    if (!result.allowed) {
      const planName = result.plan === 'trial' ? 'Trial' : 
                      result.plan === 'starter' ? 'Starter' :
                      result.plan === 'growth' ? 'Growth' : 'Domination';
      
      return {
        allowed: false,
        reason: 'email_limit',
        currentCount: result.current_count,
        maxAllowed: result.limit_amount,
        plan: result.plan,
        message: `You've reached your ${planName} plan monthly email limit (${result.current_count}/${result.limit_amount}). Upgrade to send more emails.`,
      };
    }

    return {
      allowed: true,
      currentCount: result.current_count,
      maxAllowed: result.limit_amount,
      plan: result.plan,
    };
  } catch (error: any) {
    console.error('Error checking email limit:', error);
    return {
      allowed: false,
      reason: 'email_limit',
      message: 'Error checking email limit',
    };
  }
}

/**
 * Comprehensive plan limit check - use this for all actions
 */
export async function checkPlanLimit(
  orgId: string,
  action: PlanAction
): Promise<PlanCheckResult> {
  const supabase = createSupabaseServer();

  try {
    const { data, error } = await supabase.rpc('check_plan_limit', {
      p_org_id: orgId,
      p_action: action,
    });

    if (error) {
      console.error('Error checking plan limit:', error);
      return {
        allowed: false,
        reason: 'unknown_action',
        message: 'Unable to verify plan limit',
        upgradeRequired: false,
      };
    }

    const result = data?.[0];
    if (!result) {
      return {
        allowed: false,
        reason: 'unknown_action',
        message: 'Unable to verify plan limit',
        upgradeRequired: false,
      };
    }

    return {
      allowed: result.allowed,
      reason: result.reason as PlanCheckResult['reason'],
      message: result.message,
      upgradeRequired: result.upgrade_required,
      currentCount: result.current_count,
      maxAllowed: result.max_allowed,
      plan: result.plan,
    };
  } catch (error: any) {
    console.error('Error checking plan limit:', error);
    return {
      allowed: false,
      reason: 'unknown_action',
      message: 'Error checking plan limit',
      upgradeRequired: false,
    };
  }
}

/**
 * Check daily safety cap
 */
export async function checkDailyCap(
  orgId: string,
  emailsToSend: number = 1
): Promise<PlanCheckResult> {
  const supabase = createSupabaseServer();

  try {
    const { data, error } = await supabase.rpc('can_org_send_today', {
      p_org_id: orgId,
      p_emails_to_send: emailsToSend,
    });

    if (error) {
      console.error('Error checking daily cap:', error);
      return {
        allowed: false,
        reason: 'daily_limit',
        message: 'Unable to verify daily limit',
        upgradeRequired: false,
      };
    }

    const result = data?.[0];
    if (!result) {
      return {
        allowed: false,
        reason: 'daily_limit',
        message: 'Unable to verify daily limit',
        upgradeRequired: false,
      };
    }

    if (!result.allowed) {
      return {
        allowed: false,
        reason: 'daily_limit',
        currentCount: result.current_count,
        maxAllowed: result.daily_limit,
        plan: result.plan,
        message: `You've reached your daily safety cap (${result.current_count}/${result.daily_limit} emails). This limit resets tomorrow.`,
        upgradeRequired: false,
      };
    }

    return {
      allowed: true,
      currentCount: result.current_count,
      maxAllowed: result.daily_limit,
      plan: result.plan,
      upgradeRequired: false,
    };
  } catch (error: any) {
    console.error('Error checking daily cap:', error);
    return {
      allowed: false,
      reason: 'daily_limit',
      message: 'Error checking daily limit',
      upgradeRequired: false,
    };
  }
}

/**
 * Check feature access
 */
export async function checkFeatureAccess(
  orgId: string,
  feature: PlanAction
): Promise<PlanCheckResult> {
  return checkPlanLimit(orgId, feature);
}

/**
 * Check if org is locked
 */
export async function isOrgLocked(orgId: string): Promise<{ isLocked: boolean; reason?: string; gracePeriodEndsAt?: Date }> {
  const supabase = createSupabaseServer();

  try {
    const { data, error } = await supabase.rpc('is_org_locked', {
      p_org_id: orgId,
    });

    if (error) {
      console.error('Error checking org lockout:', error);
      return { isLocked: false };
    }

    const result = data?.[0];
    if (!result) {
      return { isLocked: false };
    }

    return {
      isLocked: result.is_locked,
      reason: result.reason,
      gracePeriodEndsAt: result.grace_period_ends_at ? new Date(result.grace_period_ends_at) : undefined,
    };
  } catch (error: any) {
    console.error('Error checking org lockout:', error);
    return { isLocked: false };
  }
}

/**
 * Increment email usage after successful send (monthly)
 */
export async function incrementEmailUsage(orgId: string, count: number = 1): Promise<void> {
  const supabase = createSupabaseServer();

  try {
    const { error } = await supabase.rpc('increment_org_email_usage', {
      p_org_id: orgId,
      p_count: count,
    });

    if (error) {
      console.error('Error incrementing email usage:', error);
      // Don't throw - usage tracking failure shouldn't block sends
    }
  } catch (error) {
    console.error('Error incrementing email usage:', error);
  }
}

/**
 * Increment daily usage after successful send
 */
export async function incrementDailyUsage(orgId: string, count: number = 1): Promise<void> {
  const supabase = createSupabaseServer();

  try {
    const { error } = await supabase.rpc('increment_org_daily_usage', {
      p_org_id: orgId,
      p_count: count,
    });

    if (error) {
      console.error('Error incrementing daily usage:', error);
      // Don't throw - usage tracking failure shouldn't block sends
    }
  } catch (error) {
    console.error('Error incrementing daily usage:', error);
  }
}


