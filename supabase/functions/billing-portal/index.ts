// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions@1.4.0/types";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const APP_ORIGIN = Deno.env.get("APP_ORIGIN")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405 });
  }

  const { customer_id } = await req.json();

  if (!customer_id) {
    return new Response(JSON.stringify({ ok: false, error: "Missing customer_id" }), { status: 400 });
  }

  const body = new URLSearchParams({
    customer: customer_id,
    return_url: `${APP_ORIGIN}/billing`,
  });

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const j = await res.json();

  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: j.error?.message ?? "Stripe portal failed" }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true, url: j.url }), { status: 200 });
});











