import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/org";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabaseServer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: Request) {
  try {
    const { org_id, price_id, email } = await req.json();

    if (!org_id || !price_id || !email) {
      return NextResponse.json({ error: "Missing org_id, price_id, or email" }, { status: 400 });
    }

    // Verify user has access to this org
    const org = await getActiveOrg();
    if (!org || org.id !== org_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Create or get Stripe customer
    const supabase = createRouteHandlerClient({ cookies });
    const { data: billing } = await supabase
      .from("org_billing")
      .select("stripe_customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    let customerId = billing?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({ 
        email, 
        metadata: { org_id } 
      });
      customerId = customer.id;

      // Store customer <-> org link (use service client to bypass RLS for insert)
      const serviceSupabase = getServiceClient();
      await serviceSupabase.from("org_billing").upsert({
        org_id,
        stripe_customer_id: customerId,
        plan: "free",
        status: "inactive"
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: price_id, quantity: 1 }],
      mode: "subscription",
      success_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
      cancel_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/billing/cancel`,
      metadata: { org_id }
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: error.message || "Failed to create checkout" }, { status: 500 });
  }
}
