import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  typescript: true,
});

// Stripe price IDs for different plans
export const PRICES = {
  solo: process.env.NEXT_PUBLIC_STRIPE_PRICE_SOLO!,
  team: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM!,
  pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO!,
};

// Seat limits for each plan
export const PLAN_SEATS: Record<"solo"|"team"|"pro", number> = { 
  solo: 1, 
  team: 3, 
  pro: 10 
};

// Plan hierarchy for feature gating
export const PLAN_RANK: Record<"solo"|"team"|"pro", number> = {
  solo: 1,
  team: 2,
  pro: 3
};

/**
 * Create a Stripe checkout session for a user
 */
export async function createCheckoutSession(userId: string, priceId: string, email: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get or create Stripe customer
  let customerId: string;
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (profile?.stripe_customer_id) {
    customerId = profile.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create({
      email,
      metadata: { user_id: userId },
    });
    customerId = customer.id;

    // Store customer ID in profile
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL}/dashboard?upgraded=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL}/upgrade`,
    metadata: { user_id: userId },
  });

  return session;
}

/**
 * Create a Stripe portal session for a user to manage their subscription
 */
export async function createPortalSession(customerId: string) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL}/settings/billing`,
  });

  return session;
}
