import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: Request) {
  try {
    const { stripeCustomerId, priceId } = await req.json();

    if (!stripeCustomerId || !priceId) {
      return NextResponse.json({ error: "stripeCustomerId and priceId required" }, { status: 400 });
    }

    const baseUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: "APP_URL not configured" }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/settings/billing?ok=topup`,
      cancel_url: `${baseUrl}/settings/billing?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create top-up checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}





