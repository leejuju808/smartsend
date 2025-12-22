/**
 * Block 14800 — Stripe Sync Functions
 * 
 * Syncs billing information from Stripe on:
 * - Every login
 * - Every send
 * - Nightly cron job
 */

import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

/**
 * Sync subscription from Stripe
 */
export async function syncSubscriptionFromStripe(
  supabase: SupabaseClient<Database>,
  stripeSubscriptionId: string,
  ownerId?: string
): Promise<void> {
  try {
    // Get subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

    // Find owner_id if not provided
    if (!ownerId) {
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('owner_id')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .maybeSingle();

      if (!existingSub) {
        console.error(`No subscription found for Stripe ID: ${stripeSubscriptionId}`);
        return;
      }

      ownerId = existingSub.owner_id;
    }

    // Map Stripe status to our status
    let status = subscription.status;
    let billingStatus: 'active' | 'past_due' | 'grace_period' | 'locked' = 'active';

    if (status === 'past_due' || status === 'unpaid') {
      billingStatus = 'past_due';
      // Trigger payment failure handler if this is the first failure
      const { data: currentSub } = await supabase
        .from('subscriptions')
        .select('payment_failed_at')
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (!currentSub?.payment_failed_at) {
        // First failure - start grace period
        await supabase.rpc('handle_payment_failure', { p_owner_id: ownerId });
      }
    } else if (status === 'active' || status === 'trialing') {
      billingStatus = 'active';
      // If payment succeeded, restore access
      await supabase.rpc('handle_payment_success', { p_owner_id: ownerId });
    } else if (status === 'canceled') {
      billingStatus = 'locked';
    }

    // Map price to plan
    const priceId = subscription.items.data[0]?.price.id;
    const plan = await mapPriceToPlan(priceId);

    // Update subscription
    await supabase
      .from('subscriptions')
      .upsert({
        owner_id: ownerId,
        plan: plan || 'starter',
        status: status,
        billing_status: billingStatus,
        stripe_customer_id: subscription.customer as string,
        stripe_subscription_id: subscription.id,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        last_stripe_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'owner_id',
      });

    console.log(`Synced subscription ${stripeSubscriptionId} for owner ${ownerId}`);
  } catch (error) {
    console.error('Error syncing subscription from Stripe:', error);
    throw error;
  }
}

/**
 * Sync all subscriptions for a user (by Stripe customer ID)
 */
export async function syncUserSubscriptionsFromStripe(
  supabase: SupabaseClient<Database>,
  stripeCustomerId: string
): Promise<void> {
  try {
    // Get all subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      limit: 100,
    });

    // Find owner_id
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('owner_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();

    if (!existingSub) {
      console.error(`No subscription found for Stripe customer: ${stripeCustomerId}`);
      return;
    }

    // Sync the most recent active subscription
    const activeSubscription = subscriptions.data.find(
      sub => sub.status === 'active' || sub.status === 'trialing'
    ) || subscriptions.data[0];

    if (activeSubscription) {
      await syncSubscriptionFromStripe(supabase, activeSubscription.id, existingSub.owner_id);
    }
  } catch (error) {
    console.error('Error syncing user subscriptions from Stripe:', error);
    throw error;
  }
}

/**
 * Map Stripe price ID to plan
 */
async function mapPriceToPlan(priceId?: string): Promise<'starter' | 'growth' | 'domination' | null> {
  if (!priceId) return null;

  const starterPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ID;
  const growthPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ID;
  const dominationPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_DOMINATION_ID;

  if (priceId === starterPriceId) return 'starter';
  if (priceId === growthPriceId) return 'growth';
  if (priceId === dominationPriceId) return 'domination';

  return null;
}

/**
 * Sync subscription on login
 */
export async function syncOnLogin(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<void> {
  try {
    // Get subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_customer_id, last_stripe_sync_at')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (!subscription?.stripe_subscription_id) {
      return; // No Stripe subscription to sync
    }

    // Sync if last sync was more than 1 hour ago
    const lastSync = subscription.last_stripe_sync_at
      ? new Date(subscription.last_stripe_sync_at)
      : null;

    if (lastSync && Date.now() - lastSync.getTime() < 3600000) {
      return; // Synced recently, skip
    }

    await syncSubscriptionFromStripe(supabase, subscription.stripe_subscription_id, ownerId);
  } catch (error) {
    console.error('Error syncing on login:', error);
    // Don't throw - login should still succeed even if sync fails
  }
}

/**
 * Sync subscription before send (lightweight check)
 */
export async function syncBeforeSend(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<void> {
  try {
    // Get subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, last_stripe_sync_at')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (!subscription?.stripe_subscription_id) {
      return;
    }

    // Only sync if last sync was more than 6 hours ago (to avoid rate limits)
    const lastSync = subscription.last_stripe_sync_at
      ? new Date(subscription.last_stripe_sync_at)
      : null;

    if (lastSync && Date.now() - lastSync.getTime() < 21600000) {
      return; // Synced recently, skip
    }

    await syncSubscriptionFromStripe(supabase, subscription.stripe_subscription_id, ownerId);
  } catch (error) {
    console.error('Error syncing before send:', error);
    // Don't throw - send should still proceed if sync fails
  }
}





















































