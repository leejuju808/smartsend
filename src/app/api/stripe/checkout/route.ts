import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const plan = searchParams.get("plan");
    
    if (!plan || plan === "free") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get user profile to check if they already have a subscription
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_subscription_id, email")
      .eq("id", user.id)
      .single();

    let customerId: string;

    if (profile?.stripe_subscription_id) {
      // User already has a subscription, get the customer ID
      const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
      customerId = subscription.customer as string;
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email: profile?.email || user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env[`STRIPE_${plan.toUpperCase()}_PRICE_ID`],
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${req.nextUrl.origin}/dashboard/billing?success=true`,
      cancel_url: `${req.nextUrl.origin}/dashboard/billing?canceled=true`,
      metadata: {
        plan,
        supabase_user_id: user.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}