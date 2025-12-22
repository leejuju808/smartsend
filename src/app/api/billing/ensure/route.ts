import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2024-06-20" }) : null;

export async function POST() {
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase service credentials missing" }, { status: 500 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: account, error: accountErr } = await admin
    .from("billing_accounts")
    .select("id, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountErr) {
    return NextResponse.json({ ok: false, error: accountErr.message }, { status: 400 });
  }

  let accountId = account?.id;
  if (!accountId) {
    const { data: inserted, error: insertErr } = await admin
      .from("billing_accounts")
      .insert({ user_id: user.id, plan: "free", status: "none" })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 400 });
    }

    accountId = inserted.id;
  }

  let customerId = account?.stripe_customer_id ?? null;
  if (!customerId && stripe) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: {
        user_id: user.id,
      },
    });

    customerId = customer.id;

    const { error: updateErr } = await admin
      .from("billing_accounts")
      .update({ stripe_customer_id: customerId })
      .eq("id", accountId);

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, account_id: accountId, stripe_customer_id: customerId }, { status: 200 });
}

