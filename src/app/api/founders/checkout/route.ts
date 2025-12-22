import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSupabase } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
});

// Plan configuration for founders deal
const FOUNDERS_PLANS = {
  starter: {
    price_cents: 9900, // $99
    name: "SmartSend Starter (Founders)",
    stripe_price_id: process.env.STRIPE_FOUNDERS_STARTER_PRICE_ID, // You'll set this in Stripe
  },
  growth: {
    price_cents: 19900, // $199
    name: "SmartSend Growth (Founders)",
    stripe_price_id: process.env.STRIPE_FOUNDERS_GROWTH_PRICE_ID,
  },
  domination: {
    price_cents: 39900, // $399
    name: "SmartSend Domination (Founders)",
    stripe_price_id: process.env.STRIPE_FOUNDERS_DOMINATION_PRICE_ID,
  },
};

export async function POST(req: NextRequest) {
  try {
    const { plan, founder } = await req.json();

    if (!plan || !["starter", "growth", "domination"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan. Must be starter, growth, or domination" },
        { status: 400 }
      );
    }

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = workspaceMember.workspace_id;

    // Get or create Stripe customer
    let customerId: string;
    const { data: subscription } = await supabase
      .from("workspace_subscriptions")
      .select("stripe_customer_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (subscription?.stripe_customer_id) {
      customerId = subscription.stripe_customer_id;
    } else {
      // Get workspace name for customer
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", workspaceId)
        .single();

      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: workspace?.name || "SmartSend Customer",
        metadata: {
          workspace_id: workspaceId,
          user_id: user.id,
          founder: founder ? "true" : "false",
        },
      });

      customerId = customer.id;

      // Store customer ID
      await supabase
        .from("workspace_subscriptions")
        .upsert({
          workspace_id: workspaceId,
          stripe_customer_id: customerId,
          plan_id: plan,
          status: "inactive",
        }, {
          onConflict: "workspace_id",
        });
    }

    const planConfig = FOUNDERS_PLANS[plan as keyof typeof FOUNDERS_PLANS];
    
    // Use Stripe price ID if available, otherwise create price on the fly
    let priceId = planConfig.stripe_price_id;
    
    if (!priceId) {
      // Create price dynamically (not ideal for production, but works)
      const price = await stripe.prices.create({
        currency: "usd",
        unit_amount: planConfig.price_cents,
        recurring: { interval: "month" },
        product_data: {
          name: planConfig.name,
          metadata: {
            plan_type: plan,
            founder: founder ? "true" : "false",
          },
        },
      });
      priceId = price.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/founders/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/pricing/founders?founder=true`,
      metadata: {
        workspace_id: workspaceId,
        user_id: user.id,
        plan: plan,
        founder: founder ? "true" : "false",
      },
      subscription_data: {
        metadata: {
          workspace_id: workspaceId,
          user_id: user.id,
          plan: plan,
          founder: founder ? "true" : "false",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Founders checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}























































