/**
 * Plan Limits Configuration
 * Defines limits for each subscription plan
 */

export type PlanId = 'trial' | 'starter' | 'growth' | 'domination';

export interface PlanLimits {
  maxActiveCampaigns: number | null; // null = no cap
  monthlyEmailLimit: number | null; // null = no cap
  name: string;
  price: number;
  priceId?: string; // Stripe price ID
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  trial: {
    maxActiveCampaigns: 1,
    monthlyEmailLimit: 200,
    name: 'Trial',
    price: 0,
  },
  starter: {
    maxActiveCampaigns: 1,
    monthlyEmailLimit: 500,
    name: 'Starter',
    price: 99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ID,
  },
  growth: {
    maxActiveCampaigns: 3,
    monthlyEmailLimit: 2000,
    name: 'Growth',
    price: 199,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ID,
  },
  domination: {
    maxActiveCampaigns: null, // no cap
    monthlyEmailLimit: 20000, // soft cap for safety (20k/month)
    name: 'Domination',
    price: 399,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_DOMINATION_ID,
  },
};

/**
 * Get plan limits for a given plan ID
 */
export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLAN_LIMITS[planId] || PLAN_LIMITS.trial;
}

/**
 * Check if a plan has no campaign cap
 */
export function hasNoCampaignCap(planId: PlanId): boolean {
  return PLAN_LIMITS[planId]?.maxActiveCampaigns === null;
}

/**
 * Check if a plan has no email cap
 */
export function hasNoEmailCap(planId: PlanId): boolean {
  return PLAN_LIMITS[planId]?.monthlyEmailLimit === null;
}

/**
 * Get the next plan upgrade option
 */
export function getNextPlan(planId: PlanId): PlanId | null {
  const planOrder: PlanId[] = ['trial', 'starter', 'growth', 'domination'];
  const currentIndex = planOrder.indexOf(planId);
  if (currentIndex === -1 || currentIndex === planOrder.length - 1) {
    return null;
  }
  return planOrder[currentIndex + 1];
}









