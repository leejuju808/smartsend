import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

async function upsertSubscription(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;

  const { data: acct } = await supabase
    .from("account_subscriptions")
    .select("account_id, plan_name, plan_seat_limit")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!acct) return;

  const item = sub.items.data[0];
  const price = item?.price;
  const seatLimit = Number(price?.metadata?.seat_limit ?? "") || null;
  const planName = price?.nickname ?? price?.id ?? null;

  await supabase
    .from("account_subscriptions")
    .upsert(
      {
        account_id: acct.account_id,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        stripe_price_id: price?.id ?? null,
        subscription_status: sub.status,
        plan_name: planName,
        plan_seat_limit: seatLimit,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

  const seatsBefore = acct.plan_seat_limit ?? null;
  const planBefore = acct.plan_name ?? null;

  if (
    (planBefore ?? null) !== (planName ?? null)
    || (seatsBefore ?? null) !== (seatLimit ?? null)
  ) {
    await supabase.rpc("log_activity", {
      p_account: acct.account_id,
      p_campaign: null,
      p_actor: null,
      p_actor_role: null,
      p_action: "update",
      p_entity_type: "billing",
      p_entity_id: null,
      p_entity_name: planName,
      p_details: {
        plan_before: planBefore,
        plan_after: planName,
        seats_before: seatsBefore,
        seats_after: seatLimit,
        status: sub.status,
      },
    });
  }
}

async function applyPlanQuotaFromPrice(accountId: string, price: Stripe.Price | null) {
  const base = Number(price?.metadata?.base_quota ?? "") || null;
  if (base !== null) {
    await supabase
      .from("account_send_quota")
      .upsert(
        {
          account_id: accountId,
          base_monthly_quota: base,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" },
      );
  }
}

async function addTopupCredits(line: Stripe.InvoiceLineItem, accountId: string) {
  const credits = Number(line.price?.metadata?.topup_credits ?? "") || 0;
  if (!credits) return;
  await supabase.rpc("inc_bonus_credits", { p_account: accountId, p_delta: credits });
}

async function syncWorkspacePlan(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;
  const planId = sub.items.data[0]?.price?.id;

  if (!planId) return;

  // Map Stripe price ID → SmartSend plan
  const stripePricePro = Deno.env.get("STRIPE_PRICE_PRO");
  const stripePriceScale = Deno.env.get("STRIPE_PRICE_SCALE");

  const plan =
    planId === stripePricePro ? "pro" :
    planId === stripePriceScale ? "scale" :
    "starter";

  // Auto-seat scaling logic
  const seatLimit =
    plan === "starter" ? 1 :
    plan === "pro" ? 3 :
    plan === "scale" ? 10 :
    1;

  const dailySendCap =
    plan === "starter" ? 200 :
    plan === "pro" ? 2000 :
    plan === "scale" ? 10000 :
    200;

  // Update workspace with plan, caps, and seat limits
  const { error } = await supabase
    .from("workspaces")
    .update({
      plan,
      seat_limit: seatLimit,
      daily_send_cap: dailySendCap,
      daily_reply_cap: dailySendCap,
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to update workspace plan:", error);
  }
}

serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!sig) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    return new Response(`Webhook signature verification failed. ${err}`, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        const priceId = subscription.items.data[0]?.price?.id;
        const customerId = subscription.customer as string;

        if (!priceId || !customerId) {
          console.error("Missing priceId or customerId in checkout session");
          break;
        }

        // Map Stripe price ID → SmartSend plan
        const stripePricePro = Deno.env.get("STRIPE_PRICE_PRO");
        const stripePriceScale = Deno.env.get("STRIPE_PRICE_SCALE");
        const stripePriceSeatAddon = Deno.env.get("STRIPE_PRICE_SEAT_ADDON");

        const plan =
          priceId === stripePricePro ? "pro" :
          priceId === stripePriceScale ? "scale" :
          "starter";

        // Check if this is a seat add-on
        const isSeatAddon = priceId === stripePriceSeatAddon;

        let seatLimitChange = 0;
        if (isSeatAddon) {
          seatLimitChange = subscription.items.data[0]?.quantity ?? 0;
        }

        const updateFields: Record<string, any> = {};

        if (!isSeatAddon) {
          // Plan upgrade - update plan and seat limits
          updateFields.plan = plan;
          updateFields.seat_limit =
            plan === "starter" ? 1 : plan === "pro" ? 3 : 10;

          updateFields.daily_send_cap =
            plan === "starter" ? 200 :
            plan === "pro" ? 2000 :
            10000;

          updateFields.daily_reply_cap = updateFields.daily_send_cap;
        }

        if (isSeatAddon && seatLimitChange > 0) {
          // Increment seat limit for seat add-ons
          const { data: workspace } = await supabase
            .from("workspaces")
            .select("seat_limit")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();

          if (workspace) {
            const currentSeats = workspace.seat_limit ?? 0;
            updateFields.seat_limit = currentSeats + seatLimitChange;
          }
        }

        // Update workspace
        if (Object.keys(updateFields).length > 0) {
          const { error } = await supabase
            .from("workspaces")
            .update(updateFields)
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error("Failed to update workspace after checkout:", error);
          }
        }
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await upsertSubscription(event.data.object as Stripe.Subscription);
      if (event.type !== "customer.subscription.deleted") {
        const sub = event.data.object as Stripe.Subscription;
        const { data: acct } = await supabase
          .from("account_subscriptions")
          .select("account_id, stripe_price_id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();

        if (acct?.account_id) {
          const price = acct.stripe_price_id
            ? await stripe.prices.retrieve(acct.stripe_price_id)
            : sub.items.data[0]?.price ?? null;
          await applyPlanQuotaFromPrice(acct.account_id, price);
        }

        // Sync workspace plan (Block 290)
        await syncWorkspacePlan(sub);
      }
      break;
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const subId = inv.subscription as string;

      const { data } = await supabase
        .from("account_subscriptions")
        .select("account_id")
        .eq("stripe_subscription_id", subId)
        .maybeSingle();

      if (data) {
        await supabase
          .from("account_subscriptions")
          .update({ subscription_status: "past_due", updated_at: new Date().toISOString() })
          .eq("account_id", data.account_id);
      }
      break;
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const subId = inv.subscription as string | null;

      let accountId: string | null = null;

      if (subId) {
        const { data } = await supabase
          .from("account_subscriptions")
          .select("account_id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();
        accountId = data?.account_id ?? null;
      }

      if (!accountId) {
        const { data } = await supabase
          .from("account_subscriptions")
          .select("account_id")
          .eq("stripe_customer_id", inv.customer as string)
          .maybeSingle();
        accountId = data?.account_id ?? null;
      }

      if (accountId) {
        for (const line of inv.lines.data) {
          await addTopupCredits(line, accountId);
        }
      }

      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
