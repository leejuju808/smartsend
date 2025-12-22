/**
 * Stripe Integration Utilities
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

/**
 * Stripe Price IDs (should be set in environment variables)
 */
export const STRIPE_PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER_ID || '',
  growth: process.env.STRIPE_PRICE_GROWTH_ID || '',
  domination: process.env.STRIPE_PRICE_DOMINATION_ID || '',
} as const;

/**
 * Get plan ID from Stripe price ID
 */
export function getPlanIdFromPriceId(priceId: string): 'starter' | 'growth' | 'domination' | null {
  if (priceId === STRIPE_PRICE_IDS.starter) return 'starter';
  if (priceId === STRIPE_PRICE_IDS.growth) return 'growth';
  if (priceId === STRIPE_PRICE_IDS.domination) return 'domination';
  return null;
}

/**
 * Get Stripe price ID from plan ID
 */
export function getPriceIdFromPlanId(planId: 'starter' | 'growth' | 'domination'): string | null {
  return STRIPE_PRICE_IDS[planId] || null;
}

/**
 * Verify Stripe webhook signature
 */
export async function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}





























































