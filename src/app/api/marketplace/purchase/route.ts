import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { template_id, user_id } = await req.json();
    
    if (!template_id || !user_id) {
      return NextResponse.json({ error: "Missing template_id or user_id" }, { status: 400 });
    }

    // Get template details
    const { data: template, error: templateError } = await supabase
      .from("marketplace_templates")
      .select("*")
      .eq("id", template_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (!template.is_paid) {
      return NextResponse.json({ error: "Template is free" }, { status: 400 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user_id)
      .single();

    let customerId: string;

    if (profile?.stripe_customer_id) {
      customerId = profile.stripe_customer_id;
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email: profile?.email || user.email,
        metadata: {
          supabase_user_id: user_id,
        },
      });
      customerId = customer.id;

      // Update profile with customer ID
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user_id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: template.name,
              description: template.description,
              images: template.cover_url ? [template.cover_url] : undefined,
            },
            unit_amount: template.price_cents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.nextUrl.origin}/templates/${template_id}?success=true`,
      cancel_url: `${req.nextUrl.origin}/templates/${template_id}?canceled=true`,
      metadata: {
        template_id,
        user_id,
        template_name: template.name,
      },
    });

    // Create purchase record
    await supabase.from("marketplace_purchases").insert({
      user_id,
      template_id,
      stripe_checkout_session_id: session.id,
      amount_cents: template.price_cents,
      status: "requires_payment",
    });

    return NextResponse.json({ checkout_url: session.url });
  } catch (error: any) {
    console.error("Purchase creation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 