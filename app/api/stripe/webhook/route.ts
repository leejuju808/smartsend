// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs"; // Stripe SDK needs Node runtime
export const dynamic = "force-dynamic";

const PLAN_LIMITS: Record<
  string,
  { email_limit_monthly: number }
> = {
  free: { email_limit_monthly: 100 },
  starter: { email_limit_monthly: 500 },
  growth: { email_limit_monthly: 2000 },
  domination: { email_limit_monthly: 999999 },
};

export async function POST(req: Request) {
  const body = await req.text();
  const sig = headers().get("stripe-signature");

  if (!sig) {
    return new NextResponse("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = createServiceClient();

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const subscription = event.data.object as Stripe.Subscription;

    const customerId = subscription.customer as string;
    const price = subscription.items.data[0].price;

    const planKey =
      (price.metadata?.plan_key as string) ||
      (subscription.metadata?.plan_key as string) ||
      "free";

    const workspaceId =
      (subscription.metadata?.workspace_id as string) ??
      (price.metadata?.workspace_id as string) ??
      null;

    if (!workspaceId) {
      return new NextResponse("No workspace id on subscription", {
        status: 200,
      });
    }

    const limitConfig = PLAN_LIMITS[planKey] || PLAN_LIMITS.free;

    await supabase
      .from("workspaces")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        plan_key: planKey,
        email_limit_monthly: limitConfig.email_limit_monthly,
        // reset usage on (re)start of subscription period
        email_used_this_period: 0,
        billing_period_ends_at: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
      })
      .eq("id", workspaceId);
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    // downgrade any workspace with this subscription
    await supabase
      .from("workspaces")
      .update({
        plan_key: "free",
        email_limit_monthly: PLAN_LIMITS.free.email_limit_monthly,
        email_used_this_period: 0,
        stripe_subscription_id: null,
      })
      .eq("stripe_customer_id", customerId);
  }

  return new NextResponse("ok", { status: 200 });
}
