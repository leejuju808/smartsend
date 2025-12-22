/**
 * Block 12000 — SmartSend Billing & Subscription Enforcement
 * 
 * This module provides functions to check subscription status and enforce plan limits.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type PlanType = "starter" | "growth" | "domination";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete" | "trialing";

export interface SubscriptionInfo {
  plan: PlanType;
  status: SubscriptionStatus;
  current_period_end: string | null;
  is_active: boolean;
}

export interface CampaignLimitCheck {
  can_create: boolean;
  reason: string;
  current_count: number;
  max_allowed: number;
}

export interface EmailLimitCheck {
  can_send: boolean;
  reason: string;
  current_month_count: number;
  max_per_month: number;
  remaining: number;
}

/**
 * Get user subscription status
 */
export async function getUserSubscription(userId: string): Promise<SubscriptionInfo | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const is_active =
    (data.status === "active" || data.status === "trialing") &&
    (!data.current_period_end || new Date(data.current_period_end) > new Date());

  return {
    plan: data.plan as PlanType,
    status: data.status as SubscriptionStatus,
    current_period_end: data.current_period_end,
    is_active,
  };
}

/**
 * Check if user has active subscription
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return subscription?.is_active ?? false;
}

/**
 * Check if user can create a new campaign
 */
export async function canCreateCampaign(userId: string): Promise<CampaignLimitCheck> {
  // Check subscription status first
  const subscription = await getUserSubscription(userId);
  
  if (!subscription || !subscription.is_active) {
    return {
      can_create: false,
      reason: "Subscription inactive",
      current_count: 0,
      max_allowed: 0,
    };
  }

  // Use database function to check limits
  const { data, error } = await supabase.rpc("can_user_create_campaign", {
    p_user_id: userId,
  });

  if (error || !data || data.length === 0) {
    return {
      can_create: false,
      reason: "Error checking limits",
      current_count: 0,
      max_allowed: 0,
    };
  }

  const result = data[0];
  return {
    can_create: result.can_create,
    reason: result.reason,
    current_count: result.current_count,
    max_allowed: result.max_allowed,
  };
}

/**
 * Check if user can send an email
 */
export async function canSendEmail(userId: string): Promise<EmailLimitCheck> {
  // Check subscription status first
  const subscription = await getUserSubscription(userId);
  
  if (!subscription || !subscription.is_active) {
    return {
      can_send: false,
      reason: "Subscription inactive",
      current_month_count: 0,
      max_per_month: 0,
      remaining: 0,
    };
  }

  // Use database function to check limits
  const { data, error } = await supabase.rpc("can_user_send_email", {
    p_user_id: userId,
  });

  if (error || !data || data.length === 0) {
    return {
      can_send: false,
      reason: "Error checking limits",
      current_month_count: 0,
      max_per_month: 0,
      remaining: 0,
    };
  }

  const result = data[0];
  return {
    can_send: result.can_send,
    reason: result.reason,
    current_month_count: result.current_month_count,
    max_per_month: result.max_per_month,
    remaining: result.remaining,
  };
}

/**
 * Increment email usage counter
 */
export async function incrementEmailUsage(userId: string): Promise<void> {
  await supabase.rpc("increment_email_usage", {
    p_user_id: userId,
  });
}

/**
 * Get plan limits for a plan type
 */
export async function getPlanLimits(plan: PlanType) {
  const { data, error } = await supabase
    .from("plan_limits")
    .select("*")
    .eq("plan", plan)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    max_campaigns: data.max_campaigns,
    max_emails_per_month: data.max_emails_per_month,
    has_advanced_ai: data.has_advanced_ai,
    has_revenue_dashboard: data.has_revenue_dashboard,
    has_priority_support: data.has_priority_support,
    has_vip_onboarding: data.has_vip_onboarding,
  };
}

/**
 * Get current month email usage
 */
export async function getCurrentMonthEmailUsage(userId: string): Promise<number> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data, error } = await supabase
    .from("email_usage")
    .select("emails_sent")
    .eq("user_id", userId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error || !data) {
    return 0;
  }

  return data.emails_sent;
}

/**
 * Get active campaign count for user
 */
export async function getActiveCampaignCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["running", "sending", "active"]);

  if (error) {
    return 0;
  }

  return count ?? 0;
}





















































