import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const text = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      text,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const data = event.data.object as any;

  try {
    // Handle checkout session completion
    if (event.type === "checkout.session.completed") {
      const session = data as Stripe.Checkout.Session;
      const customerId = String(session.customer);
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as any)?.id;

      if (subscriptionId && session.metadata) {
        // Retrieve the subscription to get full details
        const subscription = (await stripe.subscriptions.retrieve(
          subscriptionId
        )) as any;
        const priceId = subscription.items.data[0]?.price?.id;
        let plan = "free";
        if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
          plan = "pro";
        } else if (priceId === process.env.STRIPE_AGENCY_PRICE_ID) {
          plan = "agency";
        }

        await supabase.from("subscriptions").upsert({
          user_id: session.metadata.user_id,
          org_id: session.metadata.org_id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan: plan,
          status: subscription.status,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
        });
      }
    }

    // Handle subscription updates and creation
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created"
    ) {
      const subscription = data as any;
      const customerId = String(subscription.customer);

      // Get plan from price ID
      const priceId = subscription.items.data[0]?.price?.id;
      let plan = "free";
      if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
        plan = "pro";
      } else if (priceId === process.env.STRIPE_AGENCY_PRICE_ID) {
        plan = "agency";
      }

      // Find subscription by customer ID
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("user_id, org_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();

      if (existingSub) {
        await supabase
          .from("subscriptions")
          .update({
            stripe_subscription_id: subscription.id,
            plan: plan,
            status: subscription.status,
            current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
      } else {
        // If subscription doesn't exist, try to get from metadata
        const userId = subscription.metadata?.user_id;
        const orgId = subscription.metadata?.org_id;

        if (userId && orgId) {
          await supabase.from("subscriptions").upsert({
            user_id: userId,
            org_id: orgId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            plan: plan,
            status: subscription.status,
            current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
          });
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = data as any;
      await supabase
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("stripe_subscription_id", subscription.id);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook handler failed" },
      { status: 500 }
    );
  }
}
