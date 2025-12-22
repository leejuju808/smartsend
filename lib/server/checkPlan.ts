// lib/server/checkPlan.ts
// Server-side plan check helpers for upgrade wall enforcement

import { PLAN_LIMITS } from "./planLimits";

export type PlanKey = "free" | "starter" | "growth" | "domination";

/**
 * Check if user can create a new campaign based on plan and current count
 */
export function canCreateCampaign(plan: PlanKey, currentCount: number): boolean {
  const limit = PLAN_LIMITS[plan].campaigns;
  if (limit === Infinity) return true;
  return currentCount < limit;
}

/**
 * Check if user can send emails based on plan and emails sent this month
 */
export function canSendEmail(plan: PlanKey, sentThisMonth: number): boolean {
  const limit = PLAN_LIMITS[plan].monthlyEmails;
  if (limit === Infinity) return true;
  return sentThisMonth < limit;
}

/**
 * Get the upgrade reason code for a failed check
 */
export function getUpgradeReason(
  plan: PlanKey,
  currentCount: number,
  limitType: "campaigns" | "monthlyEmails"
): "campaign_limit" | "monthly_email_limit" | null {
  const limit = PLAN_LIMITS[plan][limitType];
  
  if (limit === Infinity) return null;
  
  if (limitType === "campaigns" && currentCount >= limit) {
    return "campaign_limit";
  }
  
  if (limitType === "monthlyEmails" && currentCount >= limit) {
    return "monthly_email_limit";
  }
  
  return null;
}



























































