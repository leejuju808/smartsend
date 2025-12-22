import { serve } from "https://deno.land/x/sift@0.5.0/mod.ts";
import Stripe from "https://esm.sh/stripe@12.0.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

serve({
  "/": async (req) => {
    const { customer_id, return_url } = await req.json();

    const session = await stripe.billingPortal.sessions.create({
      customer: customer_id,
      return_url,
    });

    return new Response(JSON.stringify({ url: session.url }));
  },
});
