// lib/server/planLimits.ts
// Backend plan limits constants (mirror of frontend)

import { isTrialActive } from "./trial";

export const PLAN_LIMITS = {
  free: {
    campaigns: 0,
    monthlyEmails: 0,
  },
  starter: {
    campaigns: 1,
    monthlyEmails: 500,
  },
  growth: {
    campaigns: 3,
    monthlyEmails: 2000,
  },
  domination: {
    campaigns: Infinity,
    monthlyEmails: Infinity,
  },
} as const;

/**
 * Get the effective plan for a workspace, considering trial status.
 * Trial gives them Growth power for 7 days.
 */
export function effectivePlan(workspace: {
  plan_key: string | null;
  is_trial_active: boolean;
  trial_ends_at: string | null;
}): keyof typeof PLAN_LIMITS {
  // Trial gives them Growth power for 7 days
  if (isTrialActive(workspace)) {
    return "growth";
  }
  return (workspace.plan_key || "free") as keyof typeof PLAN_LIMITS;
}

