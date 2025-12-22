import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { templateSlug, successUrl, cancelUrl, userId } = await req.json();
  if (!templateSlug || !userId) return NextResponse.json({error:"missing params"}, {status:400});

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: tpl, error: e1 } = await supabase
    .from("marketplace_templates")
    .select("id, slug, title, is_premium, stripe_price_id")
    .eq("slug", templateSlug)
    .single();
  if (e1 || !tpl) return NextResponse.json({error:"template not found"}, {status:404});
  if (!tpl.is_premium || !tpl.stripe_price_id) {
    return NextResponse.json({error:"template is not premium or price missing"}, {status:400});
  }

  // If user already owns it, short-circuit
  const { data: owned } = await supabase
    .from("marketplace_entitlements")
    .select("id")
    .eq("user_id", userId)
    .eq("template_id", tpl.id)
    .maybeSingle();
  if (owned) {
    return NextResponse.json({ alreadyOwned: true }, { status: 200 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: tpl.stripe_price_id, quantity: 1 }],
    metadata: { template_id: tpl.id, template_slug: tpl.slug, user_id: userId },
    success_url: successUrl ?? `${process.env.NEXT_PUBLIC_SITE_URL}/marketplace?status=success`,
    cancel_url: cancelUrl ?? `${process.env.NEXT_PUBLIC_SITE_URL}/marketplace?status=cancel`,
  });

  // Pre-create a purchase row (requires RLS insert policy or use RPC)
  const { error: e2 } = await supabase.from("marketplace_purchases").insert({
    user_id: userId,
    template_id: tpl.id,
    stripe_checkout_session_id: session.id,
    amount_cents: 0,
    status: "requires_payment",
  });
  if (e2) console.error("purchase preinsert failed", e2);

  return NextResponse.json({ checkoutUrl: session.url }, { status: 200 });
} 