import Stripe from "https://esm.sh/stripe@14.23.0?target=deno";

Deno.serve(async (req) => {
  const { priceId, quantity, customerEmail, successUrl, cancelUrl, teamId } = await req.json();
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2023-10-16",
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: customerEmail,
    line_items: [{ price: priceId, quantity }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: teamId ? { metadata: { teamId } } : undefined,
    allow_promotion_codes: true,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { "Content-Type": "application/json" },
  });
});

