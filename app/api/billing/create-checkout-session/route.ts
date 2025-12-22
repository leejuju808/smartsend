// app/api/billing/create-checkout-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { stripe } from "@/lib/stripe";

function priceForPlan(plan: string): string {
  switch (plan) {
    case "starter":
      return process.env.STRIPE_PRICE_STARTER!;
    case "growth":
      return process.env.STRIPE_PRICE_GROWTH!;
    case "domination":
      return process.env.STRIPE_PRICE_DOMINATION!;
    default:
      throw new Error("Invalid plan_code");
  }
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { plan_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan_code = body.plan_code as "starter" | "growth" | "domination" | undefined;
  if (!plan_code) {
    return NextResponse.json({ error: "plan_code required" }, { status: 400 });
  }

  const priceId = priceForPlan(plan_code);

  // Fetch or create Stripe customer (here assume you have 'profiles' with email)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email || user.email || undefined,
      metadata: { owner_id: user.id },
    });
    customerId = customer.id;

    // store on profile
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/settings/billing?session=success`,
    cancel_url: `${baseUrl}/settings/billing?session=cancelled`,
    metadata: {
      owner_id: user.id,
      plan_code,
    },
  });

  return NextResponse.json({ url: session.url }, { status: 200 });
}
