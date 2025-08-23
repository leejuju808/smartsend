import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { workspaceId, email, seatCount, priceId } = await req.json() as { workspaceId: string; email: string; seatCount?: number; priceId?: string };

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const seats = Math.max(1, Number(seatCount || 1));

    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, stripe_customer_id")
      .eq("id", workspaceId)
      .single();
    if (wsErr || !ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Get the user ID from the email using profiles table
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    const userId = profile?.id;

    let customerId: string | null = (ws as any).stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;
      await supabase.from("workspaces").update({ stripe_customer_id: customerId }).eq("id", workspaceId);
    }

    // If a plan priceId is provided, create a single-line-item subscription for that plan.
    // Otherwise, fall back to base+seat pricing model using seatCount.
    let session: Stripe.Checkout.Session;
    if (priceId) {
      session = await stripe.checkout.sessions.create({
        customer: customerId!,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?success=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?canceled=true`,
        metadata: { 
          workspace_id: workspaceId, 
          price_id: priceId,
          user_id: userId || undefined
        },
      });
    } else {
      const basePrice = process.env.STRIPE_BASE_PRICE_ID!;
      const seatPrice = process.env.STRIPE_SEAT_PRICE_ID!;
      if (!basePrice || !seatPrice) {
        return NextResponse.json({ error: "Missing Stripe price IDs" }, { status: 500 });
      }

      session = await stripe.checkout.sessions.create({
        customer: customerId!,
        mode: "subscription",
        line_items: [
          { price: basePrice, quantity: 1 },
          { price: seatPrice, quantity: Math.max(0, seats - 1) },
        ],
        success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?success=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?canceled=true`,
        metadata: { 
          workspace_id: workspaceId, 
          seat_count: String(seats),
          user_id: userId || undefined
        },
      });
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
} 