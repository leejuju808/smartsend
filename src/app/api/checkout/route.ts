import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
});

export async function POST(req: Request) {
  const { plan } = await req.json();
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const price = plan === "pro" ? 2900 : 900;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email ?? undefined,
      metadata: { user_id: user.id, plan },
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: plan === "pro" ? "SmartSend Pro Plan" : "SmartSend Starter Plan" },
          unit_amount: price, 
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Unable to create checkout session" }, { status: 500 });
  }
}