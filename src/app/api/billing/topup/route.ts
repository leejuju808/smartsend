import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSubscriptionStatus } from "@/lib/subscription";

const PACKS: Record<string, { price: string; qty: number }> = {
  "200":  { price: process.env.STRIPE_TOPUP_200!,  qty: 200 },
  "1000": { price: process.env.STRIPE_TOPUP_1000!, qty: 1000 },
  "5000": { price: process.env.STRIPE_TOPUP_5000!, qty: 5000 },
};

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getSubscriptionStatus();
    if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });
    
    const body = await req.json().catch(() => ({}));
    const key = String(body.pack || "200");
    const pack = PACKS[key];
    
    if (!pack?.price) {
      return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: pack.price, quantity: 1 }],
      metadata: { userId, pack_qty: String(pack.qty) },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?topup=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?topup=cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Topup checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
} 