// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions@1.4.0/types";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const APP_ORIGIN = Deno.env.get("APP_ORIGIN")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405 });
  }

  const { user_id, price_id, customer_id } = await req.json();

  if (!price_id) {
    return new Response(JSON.stringify({ ok: false, error: "Missing price_id" }), { status: 400 });
  }

  const body = new URLSearchParams({
    mode: "subscription",
    success_url: `${APP_ORIGIN}/billing?success=1`,
    cancel_url: `${APP_ORIGIN}/billing`,
  });

  body.append("line_items[0][price]", price_id);
  body.append("line_items[0][quantity]", "1");

  if (customer_id) {
    body.append("customer", customer_id);
  }

  if (user_id) {
    body.append("client_reference_id", user_id);
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const j = await res.json();

  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: j.error?.message ?? "Stripe checkout failed" }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true, url: j.url }), { status: 200 });
});











