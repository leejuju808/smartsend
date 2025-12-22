/**
 * Block 9100 — Accounts Table Stripe Sync
 * Syncs Stripe subscription changes to accounts table
 */

import { createSupabaseServer } from '@/lib/supabaseServer';
import { getPlanIdFromPriceId, stripe } from './stripe';
import type Stripe from 'stripe';

/**
 * Map Stripe price ID to plan tier
 */
function mapPriceToPlan(priceId: string | undefined): 'starter' | 'growth' | 'domination' | null {
  if (!priceId) return null;
  return getPlanIdFromPriceId(priceId);
}

/**
 * Sync subscription update to accounts table
 */
export async function syncSubscriptionToAccounts(
  subscription: Stripe.Subscription
): Promise<void> {
  const supabase = createSupabaseServer();
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = mapPriceToPlan(priceId);

  if (!plan) {
    console.error('Unknown price ID for accounts sync:', priceId);
    return;
  }

  // Find account by stripe_customer_id
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!account) {
    console.log('No account found for Stripe customer:', customerId);
    return;
  }

  // Update account plan using the database function
  const { error: updateError } = await supabase.rpc('update_account_plan', {
    p_account_id: account.id,
    p_plan: plan,
  });

  if (updateError) {
    console.error('Error updating account plan:', updateError);
    return;
  }

  // Also update Stripe fields directly
  await supabase
    .from('accounts')
    .update({
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      subscription_status: subscription.status,
    })
    .eq('id', account.id);

  console.log(`Synced subscription ${subscription.id} to account ${account.id} (plan: ${plan})`);
}

/**
 * Handle subscription cancellation - lock account
 */
export async function handleSubscriptionCancellation(
  subscription: Stripe.Subscription
): Promise<void> {
  const supabase = createSupabaseServer();
  const customerId = subscription.customer as string;

  // Find account by stripe_customer_id
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!account) {
    console.log('No account found for Stripe customer:', customerId);
    return;
  }

  // Lock the account
  await supabase.rpc('update_account_plan', {
    p_account_id: account.id,
    p_plan: 'locked',
  });

  await supabase
    .from('accounts')
    .update({
      stripe_subscription_id: null,
      subscription_status: 'canceled',
    })
    .eq('id', account.id);

  console.log(`Locked account ${account.id} due to subscription cancellation`);
}

/**
 * Handle payment failure - set grace period and eventually lock
 */
export async function handlePaymentFailure(
  invoice: Stripe.Invoice,
  failureCount: number = 1
): Promise<void> {
  const supabase = createSupabaseServer();
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  // Find account by stripe_customer_id
  const { data: account } = await supabase
    .from('accounts')
    .select('id, subscription_status')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!account) {
    console.log('No account found for Stripe customer:', customerId);
    return;
  }

  // If payment failed twice, lock the account
  if (failureCount >= 2) {
    await supabase.rpc('update_account_plan', {
      p_account_id: account.id,
      p_plan: 'locked',
    });

    await supabase
      .from('accounts')
      .update({
        subscription_status: 'unpaid',
      })
      .eq('id', account.id);

    console.log(`Locked account ${account.id} after ${failureCount} payment failures`);
  } else {
    // First failure - mark as past_due but don't lock yet
    await supabase
      .from('accounts')
      .update({
        subscription_status: 'past_due',
      })
      .eq('id', account.id);

    console.log(`Marked account ${account.id} as past_due (payment failure #${failureCount})`);
  }
}

/**
 * Handle payment success - restore account access
 */
export async function handlePaymentSuccess(
  invoice: Stripe.Invoice
): Promise<void> {
  const supabase = createSupabaseServer();
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  // Get subscription to determine plan
  if (!stripe) {
    console.error('Stripe client not initialized');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const plan = mapPriceToPlan(priceId);

  if (!plan) {
    console.error('Unknown price ID for payment success:', priceId);
    return;
  }

  // Find account by stripe_customer_id
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!account) {
    console.log('No account found for Stripe customer:', customerId);
    return;
  }

  // Restore account plan
  await supabase.rpc('update_account_plan', {
    p_account_id: account.id,
    p_plan: plan,
  });

  await supabase
    .from('accounts')
    .update({
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      subscription_status: subscription.status,
    })
    .eq('id', account.id);

  console.log(`Restored account ${account.id} access (plan: ${plan})`);
}

