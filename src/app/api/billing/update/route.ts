import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/billing/update
 * Update billing information (called by Stripe webhooks)
 * This endpoint should be protected and only accessible by Stripe webhooks
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verify webhook signature (in production, verify Stripe signature)
    const body = await req.json();
    const { ownerId, subscriptionData } = body as {
      ownerId: string;
      subscriptionData: {
        plan: string;
        status: string;
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
        currentPeriodStart?: string;
        currentPeriodEnd?: string;
      };
    };

    if (!ownerId || !subscriptionData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Update subscription
    const { error } = await supabase
      .from('subscriptions')
      .upsert({
        owner_id: ownerId,
        plan: subscriptionData.plan,
        status: subscriptionData.status,
        stripe_customer_id: subscriptionData.stripeCustomerId,
        stripe_subscription_id: subscriptionData.stripeSubscriptionId,
        current_period_start: subscriptionData.currentPeriodStart,
        current_period_end: subscriptionData.currentPeriodEnd,
        last_stripe_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'owner_id',
      });

    if (error) {
      console.error("[Billing Update API]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Billing Update API]", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































