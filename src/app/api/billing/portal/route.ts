import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(_req: NextRequest) {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Find stripe_customer_id for this user
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer on file" }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url });
}

