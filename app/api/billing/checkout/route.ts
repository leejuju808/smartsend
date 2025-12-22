/**
 * BLOCK 100000 — Stripe Checkout Session API
 * 
 * Creates a Stripe checkout session for user subscriptions (Starter/Growth/Domination)
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { plan_key, user_id, founder_pricing } = body;

    // Use user_id from body or fallback to authenticated user
    const targetUserId = user_id || user.id;

    if (!plan_key || !["starter", "growth", "domination"].includes(plan_key)) {
      return NextResponse.json(
        { error: "Invalid plan_key. Must be starter, growth, or domination" },
        { status: 400 }
      );
    }

    const plan = plan_key as "starter" | "growth" | "domination";

    // Map plan_key to Stripe price ID
    const standardPriceId = {
      starter: process.env.STRIPE_PRICE_STARTER,
      growth: process.env.STRIPE_PRICE_GROWTH,
      domination: process.env.STRIPE_PRICE_DOMINATION,
    }[plan];

    const foundersPriceId = {
      starter: process.env.STRIPE_FOUNDERS_PRICE_STARTER || process.env.STRIPE_FOUNDERS_STARTER_PRICE_ID,
      growth: process.env.STRIPE_FOUNDERS_PRICE_GROWTH || process.env.STRIPE_FOUNDERS_GROWTH_PRICE_ID,
      domination: process.env.STRIPE_FOUNDERS_PRICE_DOMINATION || process.env.STRIPE_FOUNDERS_DOMINATION_PRICE_ID,
    }[plan];

    const priceId = founder_pricing ? (foundersPriceId || standardPriceId) : standardPriceId;

    if (!priceId) {
      return NextResponse.json(
        { error: `Price ID not configured for plan: ${plan_key}` },
        { status: 500 }
      );
    }

    // Get or create Stripe customer
    let customerId: string;

    // Check if user already has a Stripe customer ID in subscriptions
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (subscription?.stripe_customer_id) {
      customerId = subscription.stripe_customer_id;
    } else {
      // Get user email
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", targetUserId)
        .maybeSingle();

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: profile?.email || user.email || undefined,
        metadata: {
          user_id: targetUserId,
        },
      });

      customerId = customer.id;
    }

    // Create checkout session
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email || undefined,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/billing/success`,
      cancel_url: `${baseUrl}/billing/cancel`,
      metadata: {
        user_id: targetUserId,
        plan_key: plan_key,
        founder_pricing: founder_pricing ? "true" : "false",
      },
      subscription_data: {
        metadata: {
          user_id: targetUserId,
          plan_key: plan_key,
          founder_pricing: founder_pricing ? "true" : "false",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Checkout session error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
