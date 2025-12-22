/**
 * Block 20900 — Stripe Webhook Handler
 * 
 * Handles Stripe webhook events for organization-level subscriptions:
 * - checkout.session.completed
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_succeeded
 * - invoice.payment_failed
 */

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getPlanIdFromPriceId } from '@/lib/billing/stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(raw, sig, endpointSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Only handle subscription mode
        if (session.mode !== 'subscription') {
          break;
        }

        const customerId = String(session.customer);
        const subscriptionId = session.subscription as string;
        const orgId = session.metadata?.org_id;

        if (!orgId || !subscriptionId) {
          console.error('Missing org_id or subscription_id in checkout session');
          break;
        }

        // Retrieve subscription to get plan details
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanIdFromPriceId(priceId || '') || 'starter';

        // Upsert subscription record
        await supabase.from('subscriptions').upsert({
          organization_id: orgId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan: plan as 'starter' | 'growth' | 'domination',
          status: subscription.status === 'active' ? 'active' : 'trialing',
          period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
        }, {
          onConflict: 'organization_id',
        });

        console.log(`Subscription created for org ${orgId}: ${plan}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = String(subscription.customer);
        const subscriptionId = subscription.id;
        const orgId = subscription.metadata?.org_id;

        // Find org by customer ID if metadata missing
        let organizationId = orgId;
        if (!organizationId) {
          const { data: existing } = await supabase
            .from('subscriptions')
            .select('organization_id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          
          if (existing) {
            organizationId = existing.organization_id;
          } else {
            console.error(`Could not find organization for customer ${customerId}`);
            break;
          }
        }

        // Determine plan from price ID
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanIdFromPriceId(priceId || '') || 'starter';

        // Map Stripe status to our status
        let status: 'active' | 'past_due' | 'canceled' | 'trialing' = 'active';
        if (subscription.status === 'past_due') {
          status = 'past_due';
        } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          status = 'canceled';
        } else if (subscription.status === 'trialing') {
          status = 'trialing';
        }

        // Upsert subscription record
        await supabase.from('subscriptions').upsert({
          organization_id: organizationId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan: plan as 'starter' | 'growth' | 'domination',
          status,
          period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
        }, {
          onConflict: 'organization_id',
        });

        console.log(`Subscription ${event.type} for org ${organizationId}: ${plan} (${status})`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        // Update subscription status to canceled
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
          })
          .eq('stripe_subscription_id', subscriptionId);

        console.log(`Subscription canceled: ${subscriptionId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (!subscriptionId) {
          break;
        }

        // Update subscription status to active
        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
          })
          .eq('stripe_subscription_id', subscriptionId);

        console.log(`Payment succeeded for subscription: ${subscriptionId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (!subscriptionId) {
          break;
        }

        // Update subscription status to past_due
        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
          })
          .eq('stripe_subscription_id', subscriptionId);

        console.log(`Payment failed for subscription: ${subscriptionId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error.message },
      { status: 500 }
    );
  }
}
















































