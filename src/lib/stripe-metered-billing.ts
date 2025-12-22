import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Set up metered billing items for a workspace subscription
 * Call this after creating a Stripe subscription
 */
export async function setupMeteredBilling(
  workspaceId: string,
  stripeSubscriptionId: string
): Promise<void> {
  try {
    // Get Stripe subscription to find subscription items
    const subscription = await stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      { expand: ["items.data.price.product"] }
    );

    // Create metered billing items for emails_sent and ai_credits
    const metrics = [
      {
        metric_name: "emails_sent" as const,
        unit_price_cents: 0.3, // $0.003 per email
        stripe_price_id: process.env.STRIPE_PRICE_EMAILS_SENT, // Create in Stripe dashboard
      },
      {
        metric_name: "ai_credits" as const,
        unit_price_cents: 2, // $0.02 per AI credit
        stripe_price_id: process.env.STRIPE_PRICE_AI_CREDITS, // Create in Stripe dashboard
      },
    ];

    for (const metric of metrics) {
      // Find or create subscription item for this metric
      let subscriptionItem = subscription.items.data.find(
        (item) => item.price.id === metric.stripe_price_id
      );

      if (!subscriptionItem && metric.stripe_price_id) {
        // Add new subscription item
        subscriptionItem = await stripe.subscriptionItems.create({
          subscription: stripeSubscriptionId,
          price: metric.stripe_price_id,
        });
      }

      if (subscriptionItem) {
        // Save to database
        await supabase.from("metered_billing_items").upsert(
          {
            workspace_id: workspaceId,
            stripe_subscription_id: stripeSubscriptionId,
            stripe_subscription_item_id: subscriptionItem.id,
            metric_name: metric.metric_name,
            unit_price_cents: metric.unit_price_cents,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "workspace_id,metric_name",
          }
        );
      }
    }
  } catch (error) {
    console.error("Error setting up metered billing:", error);
    throw error;
  }
}

/**
 * Add usage credits to a workspace (for trials, promotions, etc.)
 */
export async function addUsageCredits(
  workspaceId: string,
  metricName: "emails_sent" | "ai_credits",
  credits: number,
  source: "trial" | "purchase" | "promotion" | "bonus" = "promotion",
  expiresAt?: Date
): Promise<void> {
  try {
    await supabase.from("usage_credits").insert({
      workspace_id: workspaceId,
      metric_name: metricName,
      credits,
      source,
      expires_at: expiresAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("Error adding usage credits:", error);
    throw error;
  }
}

