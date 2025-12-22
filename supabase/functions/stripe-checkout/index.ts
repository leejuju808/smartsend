import Stripe from "https://esm.sh/stripe@12.0.0";

Deno.serve(async (req) => {
  try {
    const { customer_id, price_id, quantity, mode, return_url } =
      await req.json();

    if (!customer_id || !price_id || !return_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: customer_id, price_id, return_url" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
    });

    const session = await stripe.checkout.sessions.create({
      customer: customer_id,
      mode: mode || "subscription", // "subscription" or "payment"
      line_items: [
        {
          price: price_id,
          quantity: quantity ?? 1,
        },
      ],
      success_url: return_url,
      cancel_url: return_url,
      subscription_data:
        mode === "subscription"
          ? {
              trial_period_days: 0,
            }
          : undefined,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to create checkout session" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

