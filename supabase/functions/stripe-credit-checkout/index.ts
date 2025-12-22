// Stripe Credit Checkout Edge Function
// Creates a Stripe Checkout session for credit purchases

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

Deno.serve(async (req) => {
  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, content-type",
        },
      });
    }

    const { customer_id, price_id, quantity, return_url } = await req.json();

    if (!customer_id || !price_id || !return_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: customer_id, price_id, return_url" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer_id,
      mode: "payment",
      line_items: [
        {
          price: price_id,
          quantity: quantity ?? 1,
        },
      ],
      success_url: return_url,
      cancel_url: return_url,
      metadata: {
        type: "credit_purchase",
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});








