import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url));

    // Inputs
    const url = new URL(req.url);
    const interval = (url.searchParams.get("interval") || "monthly").toLowerCase(); // monthly|annual
    const promo = url.searchParams.get("promo") || ""; // coupon id or promotion code id
    const promoType = url.searchParams.get("promo_type") || ""; // "coupon" | "promotion_code"
    const trialDaysParam = url.searchParams.get("trialDays");
    const trialDaysDefault = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS || 0);
    const trialDays = Math.max(0, Number(trialDaysParam ?? trialDaysDefault));

    const price = interval === "annual"
      ? process.env.NEXT_PUBLIC_PRICE_PRO_ANNUAL
      : process.env.NEXT_PUBLIC_PRICE_PRO_MONTHLY;

    if (!price) {
      return NextResponse.json({ error: "Missing price id(s)" }, { status: 400 });
    }

    // Ensure Stripe customer exists & is stored
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id || null;
    const customerEmail = profile?.email || user.email || undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: customerEmail,
        metadata: { app_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    // Build discounts (optional)
    const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    if (promo) {
      if (promoType === "promotion_code") discounts.push({ promotion_code: promo });
      else discounts.push({ coupon: promo });
    } else if (process.env.STRIPE_COUPON_EARLYBIRD) {
      discounts.push({ coupon: process.env.STRIPE_COUPON_EARLYBIRD });
    }

    const successUrl = process.env.STRIPE_SUCCESS_URL || `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/dashboard/billing?state=success`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/dashboard/billing?state=cancel`;

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId!,
      allow_promotion_codes: true,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      success_url: successUrl,
      cancel_url: cancelUrl,
      discounts: discounts.length ? discounts : undefined,
      subscription_data: trialDays > 0 ? { trial_period_days: trialDays } : undefined,
      metadata: { interval },
    });

    return NextResponse.redirect(session.url!, 303);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}