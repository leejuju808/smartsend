// Block 417: Subscription Enforcement Middleware
// Server-side enforcement of plan limits and feature gates

import { PLANS, PlanKey } from "./plans";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface EnforcementResult {
  allowed: boolean;
  reason?: "limit_reached" | "feature_locked" | "subscription_inactive" | "seats_exceeded";
  message?: string;
  current?: number;
  limit?: number;
}

/**
 * Get workspace subscription details
 */
async function getWorkspaceSubscription(workspaceId: string): Promise<{
  plan_key: PlanKey;
  status: string;
  current_period_end: string | null;
}> {
  const { data, error } = await supabase
    .from("workspace_billing_subscriptions")
    .select("plan_key, plan_code, status, current_period_end")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !data) {
    // Default to free plan if no subscription found
    return {
      plan_key: "free",
      status: "inactive",
      current_period_end: null,
    };
  }

  const plan_key = (data.plan_key || data.plan_code?.toLowerCase() || "free") as PlanKey;
  
  return {
    plan_key,
    status: data.status || "inactive",
    current_period_end: data.current_period_end,
  };
}

/**
 * Check if subscription is active (with grace period)
 */
function isSubscriptionActive(status: string, currentPeriodEnd: string | null): boolean {
  if (status === "active" || status === "trialing") {
    return true;
  }

  // Grace period: allow access for 3 days after period end
  if (status === "past_due" && currentPeriodEnd) {
    const periodEnd = new Date(currentPeriodEnd);
    const now = new Date();
    const daysSinceEnd = (now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceEnd <= 3;
  }

  return false;
}

/**
 * Enforce limits for a specific metric
 */
export async function enforceLimits(
  workspaceId: string,
  metric: "leads_count" | "daily_sends" | "experiments" | "warmup" | "seats"
): Promise<EnforcementResult> {
  try {
    const subscription = await getWorkspaceSubscription(workspaceId);
    const { plan_key, status, current_period_end } = subscription;

    // Check subscription status
    if (!isSubscriptionActive(status, current_period_end)) {
      return {
        allowed: false,
        reason: "subscription_inactive",
        message: "Your subscription is inactive. Please update your payment method.",
      };
    }

    const plan = PLANS[plan_key] || PLANS.free;

    switch (metric) {
      case "leads_count": {
        if (plan.max_leads === null) {
          return { allowed: true }; // no cap
        }

        const { count } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", workspaceId);

        const current = count || 0;
        if (current >= plan.max_leads) {
          return {
            allowed: false,
            reason: "limit_reached",
            message: `You've reached your lead limit of ${plan.max_leads.toLocaleString()}. Upgrade to increase limits.`,
            current,
            limit: plan.max_leads,
          };
        }

        return { allowed: true, current, limit: plan.max_leads };
      }

      case "daily_sends": {
        const today = new Date().toISOString().split("T")[0];
        
        // Count sends today (check email_events or send_queue depending on your schema)
        const { count } = await supabase
          .from("email_events")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("event_type", "sent")
          .gte("created_at", today);

        const current = count || 0;
        if (current >= plan.daily_sends) {
          return {
            allowed: false,
            reason: "limit_reached",
            message: `You've reached your daily send limit of ${plan.daily_sends.toLocaleString()}. Upgrade to send more.`,
            current,
            limit: plan.daily_sends,
          };
        }

        return { allowed: true, current, limit: plan.daily_sends };
      }

      case "experiments": {
        if (!plan.experiments) {
          return {
            allowed: false,
            reason: "feature_locked",
            message: "A/B experiments are only available on Pro and Agency plans.",
          };
        }
        return { allowed: true };
      }

      case "warmup": {
        if (!plan.warmup) {
          return {
            allowed: false,
            reason: "feature_locked",
            message: "Warmup is only available on Pro and Agency plans.",
          };
        }
        return { allowed: true };
      }

      case "seats": {
        // Count active workspace members
        const { count } = await supabase
          .from("workspace_members")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", workspaceId);

        const current = count || 0;
        if (current >= plan.seats) {
          return {
            allowed: false,
            reason: "seats_exceeded",
            message: `You've reached your seat limit of ${plan.seats}. Upgrade to add more team members.`,
            current,
            limit: plan.seats,
          };
        }

        return { allowed: true, current, limit: plan.seats };
      }

      default:
        return { allowed: true };
    }
  } catch (error: any) {
    console.error("Enforcement error:", error);
    // Fail open in case of errors (don't block users)
    return { allowed: true };
  }
}

/**
 * Check if a feature is available for the workspace
 */
export async function checkFeature(
  workspaceId: string,
  feature: "warmup" | "experiments" | "analytics" | "domains"
): Promise<EnforcementResult> {
  const subscription = await getWorkspaceSubscription(workspaceId);
  const { plan_key, status, current_period_end } = subscription;

  if (!isSubscriptionActive(status, current_period_end)) {
    return {
      allowed: false,
      reason: "subscription_inactive",
      message: "Your subscription is inactive.",
    };
  }

  const plan = PLANS[plan_key] || PLANS.free;

  switch (feature) {
    case "warmup":
      return plan.warmup
        ? { allowed: true }
        : {
            allowed: false,
            reason: "feature_locked",
            message: "Warmup is only available on Pro and Agency plans.",
          };

    case "experiments":
      return plan.experiments
        ? { allowed: true }
        : {
            allowed: false,
            reason: "feature_locked",
            message: "A/B experiments are only available on Pro and Agency plans.",
          };

    case "analytics":
      return plan.analytics
        ? { allowed: true }
        : {
            allowed: false,
            reason: "feature_locked",
            message: "Advanced analytics requires a paid plan.",
          };

    case "domains":
      return { allowed: true, current: 0, limit: plan.domains };

    default:
      return { allowed: true };
  }
}



