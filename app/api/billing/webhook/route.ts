/**
 * BLOCK 100000 — Stripe Webhook Handler (THE MONEY BRAIN)
 * 
 * Handles Stripe webhook events to sync subscription status:
 * - subscription.created
 * - invoice.paid
 * - customer.subscription.updated
 * - customer.subscription.deleted
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed", err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  const subscription = event.data.object as Stripe.Subscription;

  // Handle subscription created/updated events
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "invoice.paid"
  ) {
    const stripeCustomerId = subscription.customer as string;
    const stripeSubscriptionId = subscription.id;
    const status = subscription.status; // 'active', 'past_due', 'canceled', etc.
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

    // Get plan_key from price lookup_key or metadata
    let plan_key = "starter"; // default
    if (subscription.items.data.length > 0) {
      const price = subscription.items.data[0].price;
      // Try lookup_key first (recommended approach)
      if (price.lookup_key) {
        plan_key = price.lookup_key;
      } else {
        // Fallback to price ID mapping
        const priceId = price.id;
        if (priceId === process.env.STRIPE_PRICE_STARTER) plan_key = "starter";
        else if (priceId === process.env.STRIPE_PRICE_GROWTH) plan_key = "growth";
        else if (priceId === process.env.STRIPE_PRICE_DOMINATION) plan_key = "domination";
      }
    }

    // Get user_id from subscription metadata
    const user_id = subscription.metadata?.user_id;

    if (!user_id) {
      console.warn("No user_id in subscription metadata", stripeSubscriptionId);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Upsert subscription record
    const { error: upsertError } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: user_id,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          plan_key: plan_key,
          status: status,
          current_period_end: currentPeriodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      );

    if (upsertError) {
      console.error("Error upserting subscription:", upsertError);
      return NextResponse.json(
        { error: "Failed to update subscription" },
        { status: 500 }
      );
    }
  }

  // Handle subscription deletion
  if (event.type === "customer.subscription.deleted") {
    const stripeSubscriptionId = subscription.id;

    // Update subscription status to canceled
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("stripe_subscription_id", stripeSubscriptionId);

    if (updateError) {
      console.error("Error updating canceled subscription:", updateError);
      return NextResponse.json(
        { error: "Failed to update subscription" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
