import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe, verifyWebhookSignature, getPlanIdFromPriceId } from '@/lib/billing/stripe';
import { createSupabaseServer } from '@/lib/supabaseServer';
import {
  syncSubscriptionToAccounts,
  handleSubscriptionCancellation,
  handlePaymentFailure,
  handlePaymentSuccess,
} from '@/lib/billing/accounts-sync';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

if (!webhookSecret) {
  throw new Error('STRIPE_WEBHOOK_SECRET is not set');
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'No signature' },
      { status: 400 }
    );
  }

  let event;
  try {
    event = await verifyWebhookSignature(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServer();

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(supabase, subscription);
        // Also sync to accounts table (Block 9100)
        await syncSubscriptionToAccounts(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(supabase, subscription);
        // Also lock account (Block 9100)
        await handleSubscriptionCancellation(subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(supabase, invoice);
        // Also handle payment failure for accounts table (Block 9100)
        // Note: We'd need to track failure count - for now, treat as first failure
        await handlePaymentFailure(invoice, 1);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(supabase, invoice);
        // Also restore account access (Block 9100)
        await handlePaymentSuccess(invoice);
        break;
      }

      case 'invoice.finalized': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoiceFinalized(supabase, invoice);
        break;
      }

      case 'invoice.payment_action_required': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentActionRequired(supabase, invoice);
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(supabase, session);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionUpdate(
  supabase: any,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const planId = getPlanIdFromPriceId(priceId);

  if (!planId) {
    console.error('Unknown price ID:', priceId);
    return;
  }

  // Find org by stripe_customer_id
  const { data: billing } = await supabase
    .from('org_billing')
    .select('org_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!billing) {
    console.error('No org found for customer:', customerId);
    return;
  }

  // Update billing record
  await supabase
    .from('org_billing')
    .update({
      stripe_subscription_id: subscription.id,
      current_plan: planId,
      subscription_status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', billing.org_id);
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(
  supabase: any,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  // Find org by stripe_customer_id
  const { data: billing } = await supabase
    .from('org_billing')
    .select('org_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!billing) {
    console.error('No org found for customer:', customerId);
    return;
  }

  // Downgrade to trial
  await supabase
    .from('org_billing')
    .update({
      stripe_subscription_id: null,
      current_plan: 'trial',
      subscription_status: 'canceled',
      current_period_start: null,
      current_period_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', billing.org_id);
}

/**
 * Handle payment failed
 */
async function handlePaymentFailed(
  supabase: any,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  // Find org by stripe_customer_id
  const { data: billing } = await supabase
    .from('org_billing')
    .select('org_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!billing) {
    console.error('No org found for customer:', customerId);
    return;
  }

  // Get subscription to check status
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const status = subscription.status === 'unpaid' ? 'unpaid' : 'past_due';

  // Set grace period if not already set (3 days from now)
  const gracePeriodEndsAt = new Date();
  gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 3);

  // Update status to past_due/unpaid and set grace period
  await supabase
    .from('org_billing')
    .update({
      subscription_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', billing.org_id);

  // Also update organizations table directly
  await supabase
    .from('organizations')
    .update({
      subscription_status: status,
      lockout_grace_period_ends_at: gracePeriodEndsAt.toISOString(),
      lockout_warning_sent_at: new Date().toISOString(),
    })
    .eq('id', billing.org_id);
}

/**
 * Handle payment succeeded - restore account access
 */
async function handlePaymentSucceeded(
  supabase: any,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  // Find org by stripe_customer_id
  const { data: billing } = await supabase
    .from('org_billing')
    .select('org_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!billing) {
    console.error('No org found for customer:', customerId);
    return;
  }

  // Get subscription to get current status
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Restore account access
  await supabase
    .from('org_billing')
    .update({
      subscription_status: subscription.status,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', billing.org_id);

  // Clear lockout flags in organizations table
  await supabase
    .from('organizations')
    .update({
      subscription_status: subscription.status,
      lockout_grace_period_ends_at: null,
      lockout_warning_sent_at: null,
    })
    .eq('id', billing.org_id);
}

/**
 * Handle invoice finalized
 */
async function handleInvoiceFinalized(
  supabase: any,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  // Find org by stripe_customer_id
  const { data: billing } = await supabase
    .from('org_billing')
    .select('org_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!billing) {
    console.error('No org found for customer:', customerId);
    return;
  }

  // Get subscription to sync period dates
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  await supabase
    .from('org_billing')
    .update({
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', billing.org_id);
}

/**
 * Handle payment action required (3D Secure, etc.)
 */
async function handlePaymentActionRequired(
  supabase: any,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  // Find org by stripe_customer_id
  const { data: billing } = await supabase
    .from('org_billing')
    .select('org_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!billing) {
    console.error('No org found for customer:', customerId);
    return;
  }

  // Set status to payment_action_required
  await supabase
    .from('org_billing')
    .update({
      subscription_status: 'payment_action_required',
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', billing.org_id);

  // Set grace period warning
  const gracePeriodEndsAt = new Date();
  gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 3);

  await supabase
    .from('organizations')
    .update({
      subscription_status: 'payment_action_required',
      lockout_grace_period_ends_at: gracePeriodEndsAt.toISOString(),
      lockout_warning_sent_at: new Date().toISOString(),
    })
    .eq('id', billing.org_id);
}

/**
 * Handle checkout completed
 */
async function handleCheckoutCompleted(
  supabase: any,
  session: Stripe.Checkout.Session
) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  const metadata = session.metadata || {};

  // Get org_id from metadata (set during checkout creation)
  const orgId = metadata.org_id;

  if (!orgId) {
    console.error('No org_id in checkout session metadata');
    return;
  }

  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const planId = getPlanIdFromPriceId(priceId);

  if (!planId) {
    console.error('Unknown price ID:', priceId);
    return;
  }

  // Update or create billing record
  await supabase
    .from('org_billing')
    .upsert({
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      current_plan: planId,
      subscription_status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'org_id',
    });
}


