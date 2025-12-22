import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * AUREV Unified Billing Upgrade Endpoint
 * Creates Stripe Checkout for AUREV plan tiers
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { org_id, plan_tier } = body;

    if (!org_id || !plan_tier) {
      return NextResponse.json(
        { error: "org_id and plan_tier required" },
        { status: 400 }
      );
    }

    // Validate plan tier
    const validPlans = ['basic', 'pro', 'enterprise'];
    if (!validPlans.includes(plan_tier)) {
      return NextResponse.json(
        { error: "Invalid plan_tier. Must be one of: basic, pro, enterprise" },
        { status: 400 }
      );
    }

    // Get plan configuration from catalog
    const { data: plan } = await supabase
      .from("aurev_plan_catalog")
      .select("*")
      .eq("plan_tier", plan_tier)
      .eq("is_active", true)
      .single();

    if (!plan) {
      return NextResponse.json(
        { error: "Plan not found or inactive" },
        { status: 404 }
      );
    }

    // Get or create Stripe customer for org
    const { data: existingSub } = await supabase
      .from("aurev_subscriptions")
      .select("stripe_customer_id")
      .eq("org_id", org_id)
      .limit(1)
      .single();

    let customerId = existingSub?.stripe_customer_id;

    if (!customerId) {
      // Get org owner's email
      const { data: org } = await supabase
        .from("orgs")
        .select("owner_id")
        .eq("id", org_id)
        .single();

      const { data: owner } = await supabase.auth.admin.getUserById(org.owner_id);
      const email = owner.user?.email || `org-${org_id}@aurevhq.com`;

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email,
        metadata: { org_id }
      });

      customerId = customer.id;

      // Store customer ID
      await supabase
        .from("aurev_subscriptions")
        .insert({
          org_id,
          stripe_customer_id: customerId,
          plan_tier,
          apps_included: plan.apps_included,
          status: 'incomplete'
        });
    }

    // Create Checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: plan.stripe_price_id,
        quantity: 1
      }],
      mode: plan.interval === 'year' ? 'subscription' : 'subscription',
      success_url: `${baseUrl}/aurev-hq/dashboard?upgrade=success`,
      cancel_url: `${baseUrl}/aurev-hq/billing?upgrade=cancelled`,
      metadata: {
        org_id,
        plan_tier,
        apps_included: plan.apps_included.join(',')
      },
      subscription_data: {
        metadata: {
          org_id,
          plan_tier
        }
      }
    });

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id
    });

  } catch (error: any) {
    console.error("AUREV upgrade error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

