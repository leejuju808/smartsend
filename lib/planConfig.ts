// lib/planConfig.ts

export type PlanKey = "free" | "starter" | "growth" | "domination";

export type PlanConfig = {
  key: PlanKey;
  name: string;
  maxCampaigns: number | null; // null = unlimited
  monthlyEmailLimit: number | null; // null = unlimited/fair-use
  aiPersonalizationLimit: number | null; // null = unlimited/fair-use, Block 15400
};

export const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  free: {
    key: "free",
    name: "Free",
    maxCampaigns: 0,
    monthlyEmailLimit: 0,
    aiPersonalizationLimit: 0,
  },
  starter: {
    key: "starter",
    name: "Starter",
    maxCampaigns: 1,
    monthlyEmailLimit: 500,
    aiPersonalizationLimit: 100, // Trial limit for Starter plan
  },
  growth: {
    key: "growth",
    name: "Growth",
    maxCampaigns: 3,
    monthlyEmailLimit: 2000,
    aiPersonalizationLimit: 1000, // Growth plan gets 1000 AI personalizations/month
  },
  domination: {
    key: "domination",
    name: "Domination",
    maxCampaigns: null,
    monthlyEmailLimit: 20000, // v1 fair-use cap; can be raised later
    aiPersonalizationLimit: null, // Unlimited for Domination plan
  },
};

