import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Payload = {
  accountId?: string;
  seats?: number;
};

export async function POST(req: Request) {
  let body: Payload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountId = body.accountId;
  const seats = body.seats;

  if (!accountId || typeof accountId !== "string") {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  if (!Number.isInteger(seats) || (seats ?? 0) < 1) {
    return NextResponse.json({ error: "Invalid seat count" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceClient();

  const { data: billing, error: billingError } = await admin
    .from("account_billing")
    .select("plan_id, seats_purchased")
    .eq("account_id", accountId)
    .maybeSingle();

  if (billingError) {
    return NextResponse.json({ error: billingError.message }, { status: 400 });
  }

  const { data: seatRow, error: seatError } = await admin
    .from("account_seats")
    .select("plan, seats_in_use, seats_purchased")
    .eq("account_id", accountId)
    .maybeSingle();

  if (seatError) {
    return NextResponse.json({ error: seatError.message }, { status: 400 });
  }

  const seatsInUse = seatRow?.seats_in_use ?? 0;
  if (seats < seatsInUse) {
    return NextResponse.json(
      { error: `Cannot set seats below current members (${seatsInUse}). Remove members first.` },
      { status: 400 },
    );
  }

  const { data: subscriptionRow, error: subscriptionError } = await admin
    .from("account_subscriptions")
    .select("stripe_subscription_id, stripe_customer_id")
    .eq("account_id", accountId)
    .maybeSingle();

  if (subscriptionError) {
    return NextResponse.json({ error: subscriptionError.message }, { status: 400 });
  }

  const subscriptionId = subscriptionRow?.stripe_subscription_id;
  if (!subscriptionId) {
    return NextResponse.json({ error: "Missing Stripe subscription mapping" }, { status: 400 });
  }

  const seatPriceId = process.env.STRIPE_PRICE_SEAT;
  if (!seatPriceId) {
    return NextResponse.json({ error: "STRIPE_PRICE_SEAT not configured" }, { status: 500 });
  }

  let seatItemId: string | undefined;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  for (const item of subscription.items.data) {
    const price = item.price;
    if (!price) continue;
    if (price.id === seatPriceId || price.lookup_key === "seat") {
      seatItemId = item.id;
      break;
    }
  }

  if (!seatItemId) {
    return NextResponse.json({ error: "Seat item not found on subscription" }, { status: 400 });
  }

  await stripe.subscriptionItems.update(seatItemId, {
    quantity: seats,
    proration_behavior: "create_prorations",
  });

  const planId = seatRow?.plan ?? billing?.plan_id ?? "pro";
  const nowIso = new Date().toISOString();

  if (seatRow) {
    const { error: updateError } = await admin
      .from("account_seats")
      .update({ seats_purchased: seats, updated_at: nowIso })
      .eq("account_id", accountId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  } else {
    const { error: insertError } = await admin.from("account_seats").insert({
      account_id: accountId,
      plan: planId,
      seats_in_use: seatsInUse,
      seats_purchased: seats,
      updated_at: nowIso,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  }

  if (billing) {
    const { error: billingUpdateError } = await admin
      .from("account_billing")
      .update({ seats_purchased: seats, updated_at: nowIso })
      .eq("account_id", accountId);

    if (billingUpdateError) {
      return NextResponse.json({ error: billingUpdateError.message }, { status: 400 });
    }
  }

  const { error: lockError } = await admin.rpc("apply_seat_lock", { p_account: accountId });
  if (lockError) {
    return NextResponse.json({ error: lockError.message }, { status: 400 });
  }

  const { error: logError } = await admin.rpc("log_activity", {
    p_account: accountId,
    p_campaign: null,
    p_actor: user.id,
    p_actor_role: membership.role,
    p_action: "update",
    p_entity_type: "billing",
    p_entity_id: null,
    p_entity_name: "seats",
    p_details: { seats_to: seats },
  });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

