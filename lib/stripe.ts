// lib/stripe.ts
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20", // or latest supported
});

export const STRIPE_PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER!,
  growth: process.env.STRIPE_PRICE_GROWTH!,
  domination: process.env.STRIPE_PRICE_DOMINATION!,
};

export type PlanKey = keyof typeof STRIPE_PRICE_IDS;

// Reverse map: price_id -> plan key
export const PLAN_BY_PRICE_ID: Record<string, PlanKey> = {
  [STRIPE_PRICE_IDS.starter]: "starter",
  [STRIPE_PRICE_IDS.growth]: "growth",
  [STRIPE_PRICE_IDS.domination]: "domination",
};
