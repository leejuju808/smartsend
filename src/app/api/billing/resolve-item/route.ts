// app/api/billing/resolve-item/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { sbAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const { data: sub } = await sbAdmin
      .from("billing_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_subscription_id) {
      return NextResponse.json({ error: "No subscription" }, { status: 400 });
    }

    // get subscription items, find the metered one
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const item = stripeSub.items.data.find(i => i.price.recurring?.usage_type === "metered");
    
    if (!item) {
      return NextResponse.json({ error: "No metered item" }, { status: 400 });
    }

    await sbAdmin
      .from("billing_subscriptions")
      .update({ stripe_subscription_item_id: item.id })
      .eq("stripe_subscription_id", sub.stripe_subscription_id);

    return NextResponse.json({ ok: true, itemId: item.id });
  } catch (error) {
    console.error("Resolve item error:", error);
    return NextResponse.json(
      { error: "Failed to resolve subscription item" }, 
      { status: 500 }
    );
  }
}