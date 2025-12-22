// lib/billing/plans.ts
export type PlanId = "starter" | "growth" | "domination";

export type PlanConfig = {
  id: PlanId;
  name: string;
  price: number;
  maxCampaigns: number | null; // null = unlimited
  monthlyEmailLimit: number | null;
};

export const PLANS: Record<PlanId, PlanConfig> = {
  starter: {
    id: "starter",
    name: "Starter",
    price: 99,
    maxCampaigns: 1,
    monthlyEmailLimit: 500,
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 199,
    maxCampaigns: 3,
    monthlyEmailLimit: 2000,
  },
  domination: {
    id: "domination",
    name: "Domination",
    price: 399,
    maxCampaigns: null, // unlimited
    monthlyEmailLimit: 20000, // soft cap for now
  },
};

export function getPlanConfig(planId: PlanId | null | undefined): PlanConfig {
  if (!planId) return PLANS.starter;
  return PLANS[planId] ?? PLANS.starter;
}

