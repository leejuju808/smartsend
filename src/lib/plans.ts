// Block 417: Pricing Plan Definitions
// Server-side plan map for enforcement

export type PlanKey = "free" | "starter" | "pro" | "agency";

export interface PlanLimits {
  seats: number;
  daily_sends: number;
  max_leads: number | null; // null = no cap
  warmup: boolean;
  experiments: boolean;
  analytics: boolean;
  domains: number;
}

export const PLANS: Record<PlanKey, PlanLimits> = {
  free: {
    seats: 1,
    daily_sends: 500,
    max_leads: 5000,
    warmup: false,
    experiments: false,
    analytics: true,
    domains: 2,
  },
  starter: {
    seats: 1,
    daily_sends: 500,
    max_leads: 5000,
    warmup: false,
    experiments: false,
    analytics: true,
    domains: 2,
  },
  pro: {
    seats: 3,
    daily_sends: 5000,
    max_leads: 50000,
    warmup: true,
    experiments: true,
    analytics: true,
    domains: 10,
  },
  agency: {
    seats: 10,
    daily_sends: 20000,
    max_leads: null, // no cap
    warmup: true,
    experiments: true,
    analytics: true,
    domains: 50,
  },
};

// Plan display metadata
export const PLAN_METADATA: Record<PlanKey, { name: string; price: string; description: string }> = {
  free: {
    name: "Free",
    price: "$0/mo",
    description: "Perfect for getting started",
  },
  starter: {
    name: "Starter",
    price: "$29/mo",
    description: "For small teams",
  },
  pro: {
    name: "Pro",
    price: "$79/mo",
    description: "For growing teams",
  },
  agency: {
    name: "Agency",
    price: "$299/mo",
    description: "For agencies and large teams",
  },
};



