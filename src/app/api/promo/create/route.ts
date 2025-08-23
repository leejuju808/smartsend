import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });

// Config
const WINDOW_MINUTES = 30;           // offer window
const COUPON_ID = process.env.STRIPE_COUPON_ID_20!; // e.g., 20% off

export async function POST(_req: NextRequest) {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });
  if (status === "pro") return NextResponse.json({ error: "Already Pro" }, { status: 400 });

  // Do we already have a valid one?
  const { data: existing } = await supabaseAdmin
    .from("user_promos")
    .select("*")
    .eq("user_id", userId)
    .eq("redeemed", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  if (existing && new Date(existing.expires_at) > now) {
    return NextResponse.json({
      promotion_code_id: existing.promotion_code_id,
      expires_at: existing.expires_at,
      percent_off: existing.percent_off ?? 20
    });
  }

  // Create a unique, single-use promotion code in Stripe
  const code = await stripe.promotionCodes.create({
    coupon: COUPON_ID,
    max_redemptions: 1,
    active: true,
    // Optional: restrict to your product if you want using "restrictions"
    // restrictions: { first_time_transaction: true }
  });

  const expiresAt = new Date(now.getTime() + WINDOW_MINUTES * 60 * 1000).toISOString();

  // Best effort fetch coupon percent for UI
  let percentOff = 20;
  try {
    const coupon = await stripe.coupons.retrieve(COUPON_ID);
    // @ts-ignore
    if (coupon.percent_off) percentOff = coupon.percent_off as number;
  } catch {}

  await supabaseAdmin.from("user_promos").insert({
    user_id: userId,
    promotion_code_id: code.id,
    coupon_id: COUPON_ID,
    percent_off: percentOff,
    expires_at: expiresAt
  });

  // Log promo offered event
  try {
    await supabaseAdmin.from("events").insert({
      user_id: userId, 
      event: "promo_offered", 
      meta: { coupon: COUPON_ID, window_minutes: WINDOW_MINUTES }
    });
  } catch (error) {
    // Don't fail if event logging fails
    console.error('Event logging error:', error);
  }

  return NextResponse.json({
    promotion_code_id: code.id,
    expires_at: expiresAt,
    percent_off: percentOff
  });
} 