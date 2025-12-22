/**
 * BLOCK 100000 — Billing Enforcement & Usage Tracking
 * 
 * Helper functions for checking subscription limits and tracking usage
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Get user subscription and plan limits
 */
export async function getUserSubscriptionAndLimits(userId: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Get subscription
  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (subError || !subscription) {
    return { subscription: null, limits: null, error: subError };
  }

  // Get plan limits
  const { data: limits, error: limitsError } = await supabase
    .from("plan_limits")
    .select("*")
    .eq("plan_key", subscription.plan_key)
    .single();

  if (limitsError || !limits) {
    return { subscription, limits: null, error: limitsError };
  }

  return { subscription, limits, error: null };
}

/**
 * Get current month email usage for user
 */
export async function getCurrentEmailUsage(userId: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Calculate current month period
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Get or create usage record using the helper function
  const { data: usage, error } = await supabase.rpc("get_or_create_current_usage", {
    p_user_id: userId,
  });

  if (error) {
    // Fallback: try direct query
    const { data: directUsage, error: directError } = await supabase
      .from("email_usage")
      .select("*")
      .eq("user_id", userId)
      .eq("period_start", periodStart.toISOString())
      .maybeSingle();

    if (directError || !directUsage) {
      // Create new usage record
      const { data: newUsage, error: createError } = await supabase
        .from("email_usage")
        .insert({
          user_id: userId,
          count: 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
        })
        .select()
        .single();

      return { usage: newUsage, error: createError };
    }

    return { usage: directUsage, error: null };
  }

  return { usage: usage?.[0] || null, error: null };
}

/**
 * Check if user can send email (enforcement check)
 * Returns: { canSend: boolean, reason: string, remaining: number }
 */
export async function checkEmailLimit(userId: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Use the database function for limit checking
  const { data: limitCheck, error } = await supabase.rpc("check_email_limit", {
    p_user_id: userId,
  });

  if (error || !limitCheck || limitCheck.length === 0) {
    return {
      canSend: false,
      reason: "Unable to verify email limit. Please contact support.",
      remaining: 0,
      currentCount: 0,
      maxEmails: 0,
    };
  }

  const result = limitCheck[0];
  return {
    canSend: result.can_send,
    reason: result.reason,
    remaining: result.remaining,
    currentCount: result.current_count,
    maxEmails: result.max_emails,
  };
}

/**
 * Increment email usage after sending
 */
export async function incrementEmailUsage(userId: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Use the database function to increment
  const { error } = await supabase.rpc("increment_email_usage", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error incrementing email usage:", error);
    // Fallback: manual increment
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const { error: upsertError } = await supabase
      .from("email_usage")
      .upsert(
        {
          user_id: userId,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          count: 1,
        },
        {
          onConflict: "user_id,period_start",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (upsertError) {
      // Try update instead
      await supabase.rpc("sql", {
        query: `
          INSERT INTO email_usage (user_id, count, period_start, period_end)
          VALUES ($1, 1, $2, $3)
          ON CONFLICT (user_id, period_start)
          DO UPDATE SET count = email_usage.count + 1
        `,
        params: [userId, periodStart.toISOString(), periodEnd.toISOString()],
      });
    }
  }
}

/**
 * Get usage warning status for UI banners
 */
export async function getUsageWarning(userId: string) {
  const limitCheck = await checkEmailLimit(userId);

  if (!limitCheck.canSend) {
    return {
      type: "error" as const,
      message: "⛔ You hit your email limit. Upgrade to continue sending.",
      remaining: 0,
    };
  }

  const percentageUsed = (limitCheck.currentCount / limitCheck.maxEmails) * 100;

  // Warning at 80% usage
  if (percentageUsed >= 80) {
    return {
      type: "warning" as const,
      message: `⚠️ You have ${limitCheck.remaining} emails left this month. Upgrade to Growth for 2,000 emails/mo.`,
      remaining: limitCheck.remaining,
    };
  }

  // Info at 50% usage
  if (percentageUsed >= 50) {
    return {
      type: "info" as const,
      message: `You have ${limitCheck.remaining} emails remaining this month.`,
      remaining: limitCheck.remaining,
    };
  }

  return null;
}


























