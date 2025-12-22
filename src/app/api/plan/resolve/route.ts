import { NextRequest, NextResponse } from "next/server";
import { sbAdmin } from "@/lib/supabaseAdmin";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const { data: sub } = await sbAdmin
    .from("billing_subscriptions")
    .select("stripe_subscription_id,status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub || !["active","trialing","past_due"].includes(sub.status)) {
    // default to a tiny free plan if you want:
    const { data: freePlan } = await sbAdmin.from("plans").select("*").eq("stripe_price_id", "price_basic_xxx").maybeSingle();
    return NextResponse.json(freePlan ? { monthly_limit: freePlan.monthly_limit, rate_per_min: freePlan.rate_per_min } : { monthly_limit: 0, rate_per_min: 0 });
  }

  const s = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const baseItem = s.items.data.find(i => i.price.type === "recurring") ?? s.items.data[0];
  const priceId = baseItem?.price?.id;
  if (!priceId) return NextResponse.json({ monthly_limit: 0, rate_per_min: 0 });

  const { data: plan } = await sbAdmin.from("plans").select("*").eq("stripe_price_id", priceId).maybeSingle();
  if (!plan) return NextResponse.json({ monthly_limit: 0, rate_per_min: 0 });
  return NextResponse.json({ monthly_limit: plan.monthly_limit, rate_per_min: plan.rate_per_min });
}