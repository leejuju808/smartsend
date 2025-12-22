/**
 * Block 20900 — Billing Enforcement Utilities
 * 
 * Provides TypeScript utilities for enforcing plan limits:
 * - Campaign limits
 * - Email sending caps
 * - Team seat limits
 * - Feature access checks
 */

import { createSupabaseServer } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export type Plan = 'starter' | 'growth' | 'domination';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface SubscriptionInfo {
  organization_id: string;
  plan: Plan;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  period_end: string | null;
  max_campaigns: number | null;
  monthly_email_limit: number | null;
  max_seats: number | null;
}

export interface CampaignLimitCheck {
  allowed: boolean;
  current_count: number;
  max_allowed: number | null;
  plan: Plan;
}

export interface EmailLimitCheck {
  allowed: boolean;
  current_count: number;
  limit_amount: number | null;
  remaining: number | null;
  plan: Plan;
  month: string;
}

export interface SeatLimitCheck {
  allowed: boolean;
  current_seats: number;
  max_seats: number | null;
  plan: Plan;
}

/**
 * Get organization subscription information
 */
export async function getOrgSubscription(orgId: string): Promise<SubscriptionInfo | null> {
  const supabase = createSupabaseServer();
  
  const { data, error } = await supabase.rpc('get_org_subscription_20900', {
    p_org_id: orgId,
  });

  if (error || !data || data.length === 0) {
    console.error('Error fetching subscription:', error);
    return null;
  }

  return data[0] as SubscriptionInfo;
}

/**
 * Check if organization can create a new campaign
 */
export async function checkCampaignLimit(orgId: string): Promise<CampaignLimitCheck> {
  const supabase = createSupabaseServer();
  
  const { data, error } = await supabase.rpc('can_create_campaign_20900', {
    p_org_id: orgId,
  });

  if (error || !data || data.length === 0) {
    console.error('Error checking campaign limit:', error);
    return {
      allowed: false,
      current_count: 0,
      max_allowed: 1,
      plan: 'starter',
    };
  }

  return data[0] as CampaignLimitCheck;
}

/**
 * Check if organization can send emails
 */
export async function checkEmailLimit(
  orgId: string,
  emailsToSend: number = 1
): Promise<EmailLimitCheck> {
  const supabase = createSupabaseServer();
  
  const { data, error } = await supabase.rpc('can_send_emails_20900', {
    p_org_id: orgId,
    p_emails_to_send: emailsToSend,
  });

  if (error || !data || data.length === 0) {
    console.error('Error checking email limit:', error);
    return {
      allowed: false,
      current_count: 0,
      limit_amount: 500,
      remaining: 0,
      plan: 'starter',
      month: new Date().toISOString().slice(0, 7),
    };
  }

  return data[0] as EmailLimitCheck;
}

/**
 * Increment email usage after successful send
 */
export async function incrementEmailUsage(
  orgId: string,
  count: number = 1
): Promise<void> {
  const supabase = createSupabaseServer();
  
  const { error } = await supabase.rpc('increment_email_usage_20900', {
    p_org_id: orgId,
    p_count: count,
  });

  if (error) {
    console.error('Error incrementing email usage:', error);
  }
}

/**
 * Check if organization can add a team member
 */
export async function checkSeatLimit(orgId: string): Promise<SeatLimitCheck> {
  const supabase = createSupabaseServer();
  
  const { data, error } = await supabase.rpc('can_add_team_member_20900', {
    p_org_id: orgId,
  });

  if (error || !data || data.length === 0) {
    console.error('Error checking seat limit:', error);
    return {
      allowed: false,
      current_seats: 0,
      max_seats: 2,
      plan: 'starter',
    };
  }

  return data[0] as SeatLimitCheck;
}

/**
 * Check if organization has access to a feature
 */
export async function hasFeatureAccess(
  orgId: string,
  feature: string
): Promise<boolean> {
  const supabase = createSupabaseServer();
  
  const { data, error } = await supabase.rpc('has_feature_access_20900', {
    p_org_id: orgId,
    p_feature: feature,
  });

  if (error) {
    console.error('Error checking feature access:', error);
    return false;
  }

  return data === true;
}

/**
 * Enforce campaign creation limit
 * Returns NextResponse with error if limit exceeded, null if allowed
 */
export async function enforceCampaignLimit(orgId: string): Promise<NextResponse | null> {
  const check = await checkCampaignLimit(orgId);
  
  if (!check.allowed) {
    return NextResponse.json(
      {
        error: 'CAMPAIGN_LIMIT_REACHED',
        message: `You have reached your campaign limit (${check.current_count}/${check.max_allowed}). Upgrade to ${check.max_allowed === 1 ? 'Growth' : 'Domination'} plan to create more campaigns.`,
        current_count: check.current_count,
        max_allowed: check.max_allowed,
        plan: check.plan,
        upgradeRequired: true,
      },
      { status: 402 }
    );
  }

  return null;
}

/**
 * Enforce email sending limit
 * Returns NextResponse with error if limit exceeded, null if allowed
 */
export async function enforceEmailLimit(
  orgId: string,
  emailsToSend: number = 1
): Promise<NextResponse | null> {
  const check = await checkEmailLimit(orgId, emailsToSend);
  
  if (!check.allowed) {
    const upgradePlan = check.plan === 'starter' ? 'Growth' : 'Domination';
    return NextResponse.json(
      {
        error: 'EMAIL_LIMIT_REACHED',
        message: `You have reached your monthly email limit (${check.current_count}/${check.limit_amount}). Upgrade to ${upgradePlan} plan to send more emails.`,
        current_count: check.current_count,
        limit_amount: check.limit_amount,
        remaining: check.remaining,
        plan: check.plan,
        upgradeRequired: true,
      },
      { status: 402 }
    );
  }

  return null;
}

/**
 * Enforce team seat limit
 * Returns NextResponse with error if limit exceeded, null if allowed
 */
export async function enforceSeatLimit(orgId: string): Promise<NextResponse | null> {
  const check = await checkSeatLimit(orgId);
  
  if (!check.allowed) {
    const upgradePlan = check.plan === 'starter' ? 'Growth' : 'Domination';
    return NextResponse.json(
      {
        error: 'SEAT_LIMIT_REACHED',
        message: `You have reached your team member limit (${check.current_seats}/${check.max_seats}). Upgrade to ${upgradePlan} plan to add more team members.`,
        current_seats: check.current_seats,
        max_seats: check.max_seats,
        plan: check.plan,
        upgradeRequired: true,
      },
      { status: 402 }
    );
  }

  return null;
}

/**
 * Enforce feature access
 * Returns NextResponse with error if access denied, null if allowed
 */
export async function enforceFeatureAccess(
  orgId: string,
  feature: string,
  featureDisplayName?: string
): Promise<NextResponse | null> {
  const hasAccess = await hasFeatureAccess(orgId, feature);
  
  if (!hasAccess) {
    const subscription = await getOrgSubscription(orgId);
    const currentPlan = subscription?.plan || 'starter';
    
    // Determine required plan based on feature
    let requiredPlan: Plan = 'growth';
    if (['proposal_builder', 'ai_estimator', 'adjuster_engine', 'revenue_dashboard'].includes(feature)) {
      requiredPlan = 'domination';
    }
    
    const displayName = featureDisplayName || feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return NextResponse.json(
      {
        error: 'FEATURE_NOT_AVAILABLE',
        message: `${displayName} is not available on your ${currentPlan} plan. Upgrade to ${requiredPlan === 'growth' ? 'Growth' : 'Domination'} plan to access this feature.`,
        feature,
        currentPlan,
        requiredPlan,
        upgradeRequired: true,
      },
      { status: 403 }
    );
  }

  return null;
}
















































