// app/api/billing/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { stripe, PLAN_BY_PRICE_ID, PlanKey } from "@/lib/stripe";

type BillingStatusResponse = {
  plan: PlanKey | null;
  subscription_status: string | null;
};

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { plan: null, subscription_status: null },
      { status: 200 }
    );
  }

  const { data: billingRow, error } = await supabase
    .from("billing_customers")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !billingRow) {
    // No billing info yet
    return NextResponse.json(
      { plan: null, subscription_status: null },
      { status: 200 }
    );
  }

  const stripeCustomerId = billingRow.stripe_customer_id;

  try {
    // Get most recent subscription for this customer
    const subs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 1,
    });

    if (!subs.data.length) {
      // No active subscription
      await supabase
        .from("billing_customers")
        .update({
          subscription_status: "no_subscription",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return NextResponse.json(
        { plan: null, subscription_status: "no_subscription" },
        { status: 200 }
      );
    }

    const sub = subs.data[0];
    const status = sub.status; // 'active', 'trialing', 'past_due', etc.
    const priceId = sub.items.data[0]?.price?.id;
    const plan = priceId ? PLAN_BY_PRICE_ID[priceId] ?? null : null;

    // Update DB
    await supabase
      .from("billing_customers")
      .update({
        current_plan: plan ?? billingRow.current_plan,
        subscription_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    const response: BillingStatusResponse = {
      plan,
      subscription_status: status,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error("Error fetching Stripe subscription:", err);
    return NextResponse.json(
      {
        plan: billingRow.current_plan as PlanKey | null,
        subscription_status: billingRow.subscription_status,
      },
      { status: 200 }
    );
  }
}
