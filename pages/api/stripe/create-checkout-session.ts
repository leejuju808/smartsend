import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method not allowed");

  try {
    const { workspaceId, email, seatCount, priceId } = req.body as { workspaceId: string; email: string; seatCount?: number; priceId?: string };

    if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });
    if (!email) return res.status(400).json({ error: "email is required" });
    const seats = Math.max(1, Number(seatCount || 1));

    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, stripe_customer_id")
      .eq("id", workspaceId)
      .single();
    if (wsErr || !ws) throw new Error("Workspace not found");

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
        metadata: { workspace_id: workspaceId, price_id: priceId },
      });
    } else {
      const basePrice = process.env.STRIPE_BASE_PRICE_ID!;
      const seatPrice = process.env.STRIPE_SEAT_PRICE_ID!;
      if (!basePrice || !seatPrice) throw new Error("Missing Stripe price IDs");

      session = await stripe.checkout.sessions.create({
        customer: customerId!,
        mode: "subscription",
        line_items: [
          { price: basePrice, quantity: 1 },
          { price: seatPrice, quantity: Math.max(0, seats - 1) },
        ],
        success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?success=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?canceled=true`,
        metadata: { workspace_id: workspaceId, seat_count: String(seats) },
      });
    }

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}

