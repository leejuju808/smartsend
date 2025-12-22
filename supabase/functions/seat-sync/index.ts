import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.6.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function syncAccount(account_id: string) {
  const { data: usage } = await supabase
    .from("account_seat_usage")
    .select("seats_used")
    .eq("account_id", account_id)
    .maybeSingle();

  if (!usage) return;

  const { data: subscription } = await supabase
    .from("account_subscriptions")
    .select("stripe_subscription_id, stripe_price_id")
    .eq("account_id", account_id)
    .maybeSingle();

  if (!subscription?.stripe_subscription_id) return;

  const sub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
  const item =
    sub.items.data.find((i) => i.price.id === subscription.stripe_price_id) ??
    sub.items.data[0];

  if (!item) return;

  await stripe.subscriptionItems.update(item.id, {
    quantity: usage.seats_used,
  });

  await supabase
    .from("account_subscriptions")
    .update({ plan_seat_limit: usage.seats_used, updated_at: new Date().toISOString() })
    .eq("account_id", account_id);
}

serve(async (req) => {
  const { account_id } = await req.json();
  if (!account_id) {
    return new Response(JSON.stringify({ ok: false, error: "missing account_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await syncAccount(account_id);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});




