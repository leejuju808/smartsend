import Stripe from "https://esm.sh/stripe@14.23.0?target=deno";

Deno.serve(async (req) => {
  try {
    const { teamId, priceId, email, successUrl, cancelUrl, plan } = await req.json();

    if (!priceId || !email || !successUrl || !cancelUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: priceId, email, successUrl, cancelUrl" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      httpClient: Stripe.createFetchHttpClient(),
      apiVersion: "2023-10-16",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: teamId && plan ? { metadata: { teamId, plan } } : undefined,
      allow_promotion_codes: true,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to create checkout session" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

