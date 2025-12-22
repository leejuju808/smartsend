'use server';

import Stripe from 'stripe';

// Initialize Stripe with environment variable
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn('STRIPE_SECRET_KEY is not set');
}

const s = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

/**
 * Apply credits to a Stripe customer's balance
 * @param customerId - The Stripe customer ID
 * @param amountCents - Amount in cents (positive integer)
 */
export async function applyOrgCreditsToStripeCustomer(
  customerId: string,
  amountCents: number
) {
  if (amountCents <= 0) {
    console.warn('Invalid amount cents:', amountCents);
    return;
  }

  if (!s) {
    console.warn('Stripe not initialized, skipping credit application');
    return;
  }

  try {
    await s.customers.createBalanceTransaction(customerId, {
      amount: amountCents,
      currency: 'usd',
      description: 'SmartSend credits sync',
    });
  } catch (error) {
    console.error('Failed to apply Stripe customer balance:', error);
    throw error;
  }
}

