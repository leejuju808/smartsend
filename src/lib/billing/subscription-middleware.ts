/**
 * Block 12000 — Subscription Check Middleware
 * 
 * Middleware functions to check subscription status before allowing API operations.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasActiveSubscription, canCreateCampaign, canSendEmail } from "./subscription-enforcement";

/**
 * Middleware to check if user has active subscription
 * Returns error response if subscription is inactive
 */
export async function requireActiveSubscription(
  userId: string
): Promise<NextResponse | null> {
  const isActive = await hasActiveSubscription(userId);

  if (!isActive) {
    return NextResponse.json(
      {
        error: "Subscription inactive",
        message: "Your subscription is inactive. Reactivate to continue sending homeowner outreach.",
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Middleware to check if user can create a campaign
 * Returns error response if limit reached
 */
export async function requireCampaignLimit(
  userId: string
): Promise<NextResponse | null> {
  const check = await canCreateCampaign(userId);

  if (!check.can_create) {
    return NextResponse.json(
      {
        error: "Campaign limit reached",
        message: check.reason,
        current_count: check.current_count,
        max_allowed: check.max_allowed,
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Middleware to check if user can send email
 * Returns error response if limit reached
 */
export async function requireEmailLimit(
  userId: string
): Promise<NextResponse | null> {
  const check = await canSendEmail(userId);

  if (!check.can_send) {
    return NextResponse.json(
      {
        error: "Email limit reached",
        message: check.reason,
        current_month_count: check.current_month_count,
        max_per_month: check.max_per_month,
        remaining: check.remaining,
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Combined middleware: Check subscription + campaign limit
 */
export async function requireSubscriptionAndCampaignLimit(
  userId: string
): Promise<NextResponse | null> {
  // Check subscription first
  const subCheck = await requireActiveSubscription(userId);
  if (subCheck) return subCheck;

  // Check campaign limit
  const campaignCheck = await requireCampaignLimit(userId);
  if (campaignCheck) return campaignCheck;

  return null;
}

/**
 * Combined middleware: Check subscription + email limit
 */
export async function requireSubscriptionAndEmailLimit(
  userId: string
): Promise<NextResponse | null> {
  // Check subscription first
  const subCheck = await requireActiveSubscription(userId);
  if (subCheck) return subCheck;

  // Check email limit
  const emailCheck = await requireEmailLimit(userId);
  if (emailCheck) return emailCheck;

  return null;
}





















































