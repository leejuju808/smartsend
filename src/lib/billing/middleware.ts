/**
 * Plan Enforcement Middleware
 * Use this in API routes to enforce plan limits before allowing actions
 */

import { NextResponse } from 'next/server';
import { checkPlanLimit, checkDailyCap, isOrgLocked, incrementEmailUsage, incrementDailyUsage, PlanAction } from './enforcement';

export interface EnforcementResult {
  allowed: boolean;
  response?: NextResponse;
}

/**
 * Middleware to check if org can perform an action
 * Returns NextResponse if blocked, null if allowed
 */
export async function enforcePlanLimit(
  orgId: string | null,
  action: PlanAction
): Promise<EnforcementResult> {
  if (!orgId) {
    // No org - allow but log warning
    console.warn('No orgId provided for plan enforcement');
    return { allowed: true };
  }

  // Check account lockout first
  const lockoutCheck = await isOrgLocked(orgId);
  if (lockoutCheck.isLocked) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'ACCOUNT_LOCKED',
          message: lockoutCheck.reason === 'payment_required'
            ? 'Your SmartSend account has been locked due to payment issues. Please update your payment method to resume sending.'
            : 'Your SmartSend account has been locked.',
          gracePeriodEndsAt: lockoutCheck.gracePeriodEndsAt?.toISOString(),
          upgradeRequired: true,
        },
        { status: 403 }
      ),
    };
  }

  // Check plan limit for the action
  const limitCheck = await checkPlanLimit(orgId, action);
  if (!limitCheck.allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: limitCheck.reason?.toUpperCase() || 'PLAN_LIMIT_EXCEEDED',
          message: limitCheck.message,
          currentCount: limitCheck.currentCount,
          maxAllowed: limitCheck.maxAllowed,
          plan: limitCheck.plan,
          upgradeRequired: limitCheck.upgradeRequired,
        },
        { status: 403 }
      ),
    };
  }

  return { allowed: true };
}

/**
 * Middleware to check if org can send emails (checks both monthly and daily limits)
 */
export async function enforceEmailSending(
  orgId: string | null,
  emailsToSend: number = 1
): Promise<EnforcementResult> {
  if (!orgId) {
    return { allowed: true };
  }

  // Check account lockout
  const lockoutCheck = await isOrgLocked(orgId);
  if (lockoutCheck.isLocked) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'ACCOUNT_LOCKED',
          message: 'Your SmartSend account has been locked due to payment issues. Please update your payment method to resume sending.',
          gracePeriodEndsAt: lockoutCheck.gracePeriodEndsAt?.toISOString(),
          upgradeRequired: true,
        },
        { status: 403 }
      ),
    };
  }

  // Check monthly email limit
  const monthlyCheck = await checkPlanLimit(orgId, 'send_email');
  if (!monthlyCheck.allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: monthlyCheck.reason?.toUpperCase() || 'EMAIL_LIMIT_EXCEEDED',
          message: monthlyCheck.message,
          currentCount: monthlyCheck.currentCount,
          maxAllowed: monthlyCheck.maxAllowed,
          plan: monthlyCheck.plan,
          upgradeRequired: monthlyCheck.upgradeRequired,
        },
        { status: 403 }
      ),
    };
  }

  // Check daily safety cap
  const dailyCheck = await checkDailyCap(orgId, emailsToSend);
  if (!dailyCheck.allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'DAILY_LIMIT_EXCEEDED',
          message: dailyCheck.message,
          currentCount: dailyCheck.currentCount,
          maxAllowed: dailyCheck.maxAllowed,
          plan: dailyCheck.plan,
          upgradeRequired: false, // Daily cap doesn't require upgrade, just wait
        },
        { status: 429 } // 429 Too Many Requests for daily limits
      ),
    };
  }

  return { allowed: true };
}

/**
 * Track email usage after successful send
 */
export async function trackEmailUsage(orgId: string | null, count: number = 1): Promise<void> {
  if (!orgId) return;

  try {
    // Increment both monthly and daily usage
    await Promise.all([
      incrementEmailUsage(orgId, count),
      incrementDailyUsage(orgId, count),
    ]);
  } catch (error) {
    console.error('Failed to track email usage:', error);
    // Don't throw - usage tracking failure shouldn't block sends
  }
}




























































