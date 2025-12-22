import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.23.0?target=deno";

Deno.serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;
  const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2023-10-16",
  });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    return new Response(`Webhook signature verification failed.`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  switch (event.type) {
    case "customer.created":
    case "customer.updated": {
      // Optional: map stripe_customer_id to teams via email lookup
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const plan = sub.metadata?.plan || "pro";
      const teamId = sub.metadata?.teamId;
      
      if (teamId) {
        await supabase.from("teams").update({
          plan,
          stripe_subscription_id: sub.id,
          stripe_price_id: sub.items.data[0]?.price.id,
          stripe_customer_id: String(sub.customer),
          updated_at: new Date().toISOString(),
        }).eq("id", teamId);
      }
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});

