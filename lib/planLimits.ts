// lib/planLimits.ts
import type { PlanKey } from "./stripe";

export type PlanLimits = {
  maxCampaigns: number;
  monthlyEmailLimit: number;
};

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  starter: {
    maxCampaigns: 1,
    monthlyEmailLimit: 500,
  },
  growth: {
    maxCampaigns: 3,
    monthlyEmailLimit: 2000,
  },
  domination: {
    maxCampaigns: 9999, // effectively unlimited
    monthlyEmailLimit: 999999,
  },
};
