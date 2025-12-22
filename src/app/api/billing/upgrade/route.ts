/**
 * Block 17300 — SmartSend Billing Guard v2
 * 
 * API route for handling plan upgrades
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { plan, returnUrl } = await req.json();

    if (!plan || !['starter', 'growth', 'domination'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Get user's subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('owner_id', user.id)
      .maybeSingle();

    // Get Stripe customer ID or create one
    let customerId = subscription?.stripe_customer_id;

    if (!customerId) {
      // Get user email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single();

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: profile?.email || user.email || undefined,
        metadata: {
          owner_id: user.id,
          user_id: user.id,
        },
      });

      customerId = customer.id;

      // Update subscription with customer ID
      await supabase
        .from('subscriptions')
        .upsert({
          owner_id: user.id,
          stripe_customer_id: customerId,
        }, {
          onConflict: 'owner_id',
        });
    }

    // Get price ID for plan
    const priceId = getPriceIdForPlan(plan);
    if (!priceId) {
      return NextResponse.json({ error: 'Price ID not configured for plan' }, { status: 500 });
    }

    // Create or update subscription
    if (subscription?.stripe_subscription_id) {
      // Update existing subscription
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        items: [{
          id: stripeSubscription.items.data[0].id,
          price: priceId,
        }],
        proration_behavior: 'always_invoice',
        metadata: {
          owner_id: user.id,
          user_id: user.id,
        },
      });
    } else {
      // Create new subscription
      await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        metadata: {
          owner_id: user.id,
          user_id: user.id,
        },
      });
    }

    // Return success
    return NextResponse.json({ 
      success: true,
      message: 'Subscription updated successfully',
    });
  } catch (error: any) {
    console.error('Error upgrading subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upgrade subscription' },
      { status: 500 }
    );
  }
}

function getPriceIdForPlan(plan: string): string | null {
  switch (plan) {
    case 'starter':
      return process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ID || null;
    case 'growth':
      return process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ID || null;
    case 'domination':
      return process.env.NEXT_PUBLIC_STRIPE_PRICE_DOMINATION_ID || null;
    default:
      return null;
  }
}
