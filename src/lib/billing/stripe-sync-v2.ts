/**
 * Block 17300 — SmartSend Billing Guard v2
 * 
 * Stripe sync functions for real-time subscription updates
 */

import Stripe from 'stripe';
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { startGracePeriod, resolveGracePeriod } from './guard-v2';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

// Rate limiting: track last sync times
const syncCache = new Map<string, number>();
const SYNC_RATE_LIMIT_LOGIN = 60 * 60 * 1000; // 1 hour
const SYNC_RATE_LIMIT_SEND = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Sync subscription from Stripe (v2)
 */
export async function syncSubscriptionFromStripe(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  stripeSubscriptionId: string
): Promise<void> {
  try {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['customer', 'items.data.price.product'],
    });

    const customerId = typeof subscription.customer === 'string' 
      ? subscription.customer 
      : subscription.customer.id;

    // Determine plan from price ID
    const priceId = subscription.items.data[0]?.price.id;
    const plan = mapPriceIdToPlan(priceId);

    // Update subscription in database
    const { error: updateError } = await supabase
      .from('subscriptions')
      .upsert({
        owner_id: ownerId,
        plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        status: subscription.status as any,
        billing_status: subscription.status === 'active' || subscription.status === 'trialing' 
          ? 'active' 
          : subscription.status === 'past_due' 
            ? 'past_due' 
            : 'locked',
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        last_stripe_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'owner_id',
      });

    if (updateError) {
      console.error('Error syncing subscription:', updateError);
      throw updateError;
    }

    // Handle payment failures
    if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
      await startGracePeriod(supabase, ownerId);
    } else if (subscription.status === 'active') {
      // Resolve grace period if payment succeeded
      await resolveGracePeriod(supabase, ownerId);
    }

    // Log event
    await supabase
      .from('billing_events')
      .insert({
        owner_id: ownerId,
        event_type: 'plan_changed',
        event_data: {
          plan,
          status: subscription.status,
          synced_at: new Date().toISOString(),
        },
      });
  } catch (error) {
    console.error('Error syncing subscription from Stripe:', error);
    throw error;
  }
}

/**
 * Sync on login (rate limited: 1 hour)
 */
export async function syncOnLogin(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<void> {
  const cacheKey = `login:${ownerId}`;
  const lastSync = syncCache.get(cacheKey);
  const now = Date.now();

  if (lastSync && (now - lastSync) < SYNC_RATE_LIMIT_LOGIN) {
    return; // Skip sync if within rate limit
  }

  // Get subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (!subscription?.stripe_subscription_id) {
    return; // No subscription to sync
  }

  await syncSubscriptionFromStripe(supabase, ownerId, subscription.stripe_subscription_id);
  syncCache.set(cacheKey, now);
}

/**
 * Sync before send (rate limited: 6 hours)
 */
export async function syncBeforeSend(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<void> {
  const cacheKey = `send:${ownerId}`;
  const lastSync = syncCache.get(cacheKey);
  const now = Date.now();

  if (lastSync && (now - lastSync) < SYNC_RATE_LIMIT_SEND) {
    return; // Skip sync if within rate limit
  }

  // Get subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (!subscription?.stripe_subscription_id) {
    return; // No subscription to sync
  }

  await syncSubscriptionFromStripe(supabase, ownerId, subscription.stripe_subscription_id);
  syncCache.set(cacheKey, now);
}

/**
 * Map Stripe price ID to plan
 */
function mapPriceIdToPlan(priceId?: string): 'starter' | 'growth' | 'domination' {
  if (!priceId) {
    return 'starter'; // Default
  }

  // Check environment variables for price IDs
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ID) {
    return 'starter';
  }
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ID) {
    return 'growth';
  }
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_DOMINATION_ID) {
    return 'domination';
  }

  // Fallback: try to infer from price metadata or name
  return 'starter';
}

/**
 * Handle Stripe webhook events (v2)
 */
export async function handleStripeWebhook(
  supabase: SupabaseClient<Database>,
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const ownerId = subscription.metadata?.owner_id || subscription.metadata?.user_id;
      
      if (!ownerId) {
        console.error('No owner_id in subscription metadata');
        return;
      }

      await syncSubscriptionFromStripe(supabase, ownerId, subscription.id);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const ownerId = subscription.metadata?.owner_id || subscription.metadata?.user_id;
      
      if (!ownerId) {
        return;
      }

      // Update subscription status
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          billing_status: 'locked',
          updated_at: new Date().toISOString(),
        })
        .eq('owner_id', ownerId);

      // Log event
      await supabase
        .from('billing_events')
        .insert({
          owner_id: ownerId,
          event_type: 'subscription_canceled',
          event_data: {
            canceled_at: new Date().toISOString(),
          },
        });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' 
        ? invoice.customer 
        : invoice.customer?.id;

      if (!customerId) {
        return;
      }

      // Find owner by customer ID
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('owner_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

      if (!subscription) {
        return;
      }

      await startGracePeriod(supabase, subscription.owner_id);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' 
        ? invoice.customer 
        : invoice.customer?.id;

      if (!customerId) {
        return;
      }

      // Find owner by customer ID
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('owner_id, stripe_subscription_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

      if (!sub) {
        return;
      }

      // Sync subscription to get latest status
      if (sub.stripe_subscription_id) {
        await syncSubscriptionFromStripe(supabase, sub.owner_id, sub.stripe_subscription_id);
      } else {
        // Just resolve grace period
        await resolveGracePeriod(supabase, sub.owner_id);
      }
      break;
    }

    default:
      // Unhandled event type
      break;
  }
}





















































