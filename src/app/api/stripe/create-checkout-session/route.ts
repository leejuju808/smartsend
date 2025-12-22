import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { user_id, email, refCode } = await req.json();
    if (!user_id || !email) {
      return NextResponse.json({ error: "user_id and email required" }, { status: 400 });
    }

    // Ensure profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    // Create or reuse Stripe customer
    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { user_id },
      });
      customerId = customer.id;
      await supabase.from("profiles").upsert({ user_id, email, stripe_customer_id: customer.id });
    }

    // Build metadata
    const metadata: Record<string, string> = { user_id };
    const subscriptionMetadata: Record<string, string> = { user_id };
    if (refCode) {
      metadata.ref = String(refCode);
      subscriptionMetadata.ref = String(refCode);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId!,
      line_items: [
        {
          price: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID!, // e.g., price_123
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=1`,
      subscription_data: {
        metadata: subscriptionMetadata,
      },
      metadata,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("checkout error", e);
    return NextResponse.json({ error: e.message ?? "checkout failed" }, { status: 500 });
  }
}
