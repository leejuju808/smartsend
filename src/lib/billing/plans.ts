// /lib/billing/plans.ts
export type PlanId = "free" | "starter" | "pro" | "scale";

export const PLANS: Record<PlanId, {
  name: string;
  priceId?: string;           // Stripe price_... (set via env or mapping)
  monthlyCap: number;         // max emails/month
  features: string[];
}> = {
  free:    { name: "Free",    monthlyCap: 200,   features: ["Basic sending","CSV import"] },
  starter: { name: "Starter", monthlyCap: 3000,  features: ["Open/Click tracking","AI rewriter"], priceId: process.env.STRIPE_PRICE_STARTER_ID },
  pro:     { name: "Pro",     monthlyCap: 15000, features: ["Reply AI","Team sharing"],           priceId: process.env.STRIPE_PRICE_PRO_ID },
  scale:   { name: "Scale",   monthlyCap: 100000,features: ["Priority queue","Premium support"],  priceId: process.env.STRIPE_PRICE_SCALE_ID },
};