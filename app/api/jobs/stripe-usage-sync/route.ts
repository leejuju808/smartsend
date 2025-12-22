import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
const BATCH = 100;

export async function POST(_req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase credentials missing" }, { status: 500 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY missing" }, { status: 500 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: rows, error } = await admin
    .from("usage_events")
    .select("id, user_id, event_type, quantity, created_at, meta")
    .is("meta->>synced", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ done: true });
  }

  let processed = 0;

  for (const r of rows) {
    try {
      const { data: acct, error: acctError } = await admin
        .from("billing_accounts")
        .select("stripe_subscription_item_id")
        .eq("user_id", r.user_id)
        .maybeSingle();

      if (acctError) {
        console.error("Stripe usage sync: account lookup failed", acctError);
        continue;
      }

      if (!acct?.stripe_subscription_item_id) {
        console.warn("Stripe usage sync: missing subscription item id", {
          user_id: r.user_id,
          event_id: r.id,
        });
        continue;
      }

      await stripe.subscriptionItems.createUsageRecord(acct.stripe_subscription_item_id, {
        quantity: r.quantity,
        timestamp: Math.floor(new Date(r.created_at as string).getTime() / 1000),
        action: "increment",
      });

      const meta = typeof r.meta === "object" && r.meta !== null ? r.meta : {};

      const { error: updateError } = await admin
        .from("usage_events")
        .update({ meta: { ...meta, synced: true, synced_at: new Date().toISOString() } })
        .eq("id", r.id);

      if (updateError) {
        console.error("Stripe usage sync: failed to update usage event", updateError);
        continue;
      }

      processed += 1;
    } catch (err) {
      console.error("Stripe usage sync error", err);
    }
  }

  return NextResponse.json({ synced: processed, attempted: rows.length });
}












