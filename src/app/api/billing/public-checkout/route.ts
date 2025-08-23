import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/server/supabase";
import { recordEvent } from "@/lib/events";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });

export async function POST(req: NextRequest) {
  try {
    const { email, plan = "monthly", promotion_code } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
    const e = String(email).trim().toLowerCase();

    // 1) Find or create Supabase user (server role)
    let userId: string | null = null;

    // Try to find profile by email
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", e)
      .maybeSingle();

    if (prof?.id) {
      userId = prof.id;
    } else {
      // Create auth user and matching profile row
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: e,
        email_confirm: true, // trust since we control creation
      });
      if (createErr || !created?.user?.id) {
        return NextResponse.json({ error: createErr?.message || "Failed to create user" }, { status: 500 });
      }
      userId = created.user.id;

      // Make sure profiles has the row
      await supabaseAdmin.from("profiles").upsert({ id: userId, email: e });
    }

    // 2) Send a magic link so they can log in post-checkout (optional but nice)
    // (They can ignore it if they're already signed in later.)
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: e,
      options: {
        // redirect: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard` // optional
      },
    });

    // 3) Create Stripe Checkout using client_reference_id & customer_email
    const priceBase = plan === "annual"
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL!
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_ID!;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_creation: "always",                  // ensure a Customer is created
      customer_email: e,                            // helps match in webhook as a fallback
      payment_method_types: ["card"],
      line_items: [{ price: priceBase, quantity: 1 }],
      allow_promotion_codes: true,
      ...(promotion_code ? { discounts: [{ promotion_code }] } : {}),
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?upgrade=success&plan=${plan}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pricing?upgrade=cancel`,
      client_reference_id: userId!,                 // tie back to our user
      consent_collection: { terms_of_service: "required" }, // optional
    });

    // Record checkout initiated event with plan info
    if (userId) {
      await recordEvent(userId, "checkout_initiated", { plan });
      
      // Log promo clicked event if promotion code was used
      if (promotion_code) {
        await recordEvent(userId, "promo_clicked", { promotion_code, plan });
      }
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Checkout init failed" }, { status: 500 });
  }
} 