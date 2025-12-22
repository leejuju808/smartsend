// supabase/functions/stripeSeatSync/index.ts
// Permissions: invoke with service role from server or with a signed admin call

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.23.0?target=deno";

type Payload = { teamId: string };

Deno.serve(async (req) => {
  try {
    const { teamId } = (await req.json()) as Payload;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      httpClient: Stripe.createFetchHttpClient(),
      apiVersion: "2023-10-16",
    });

    // Load team with subscription + seat_count
    const { data: team, error } = await supabase
      .from("teams")
      .select("id, stripe_subscription_id, seat_count")
      .eq("id", teamId)
      .single();

    if (error || !team) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
    }

    if (!team.stripe_subscription_id) {
      return new Response(JSON.stringify({ skipped: "No subscription" }), { status: 200 });
    }

    const sub = await stripe.subscriptions.retrieve(team.stripe_subscription_id);

    // Assume single per-seat item; if multiple, pick the seat price by metadata
    const item = sub.items.data[0];
    await stripe.subscriptionItems.update(item.id, {
      quantity: team.seat_count,
      proration_behavior: "create_prorations",
    });

    return new Response(JSON.stringify({ ok: true, quantity: team.seat_count }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

