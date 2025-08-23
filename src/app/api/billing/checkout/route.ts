import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSubscriptionStatus } from "@/lib/subscription";
import { recordEvent } from "@/lib/events";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
});

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const plan = (body?.plan === "annual") ? "annual" : "monthly";
    const promotion_code = body?.promotion_code as string | undefined;

    const priceBase = plan === "annual"
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL!
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_ID!;

    const lineItems = [
      {
        price: priceBase,
        quantity: 1,
      },
      {
        price: process.env.NEXT_PUBLIC_STRIPE_METERED_PRICE_ID!, // metered add-on (usage billed)
        quantity: 1,
      },
    ];

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      allow_promotion_codes: true,
      ...(promotion_code ? { discounts: [{ promotion_code }] } : {}),
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?upgrade=success&plan=${plan}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/billing?upgrade=cancel`,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
      },
    });

    // Record checkout initiated event with plan info
    await recordEvent(userId, "checkout_initiated", { plan });
    
    // Log promo clicked event if promotion code was used
    if (promotion_code) {
      await recordEvent(userId, "promo_clicked", { promotion_code, plan });
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: err.message || "Failed to create checkout session" }, { status: 500 });
  }
} 