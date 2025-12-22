import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const ORIGIN = Deno.env.get("APP_ORIGIN")!;
const PRICES: Record<string, string | undefined> = {
  starter: Deno.env.get("STRIPE_PRICE_STARTER"),
  pro: Deno.env.get("STRIPE_PRICE_PRO"),
  team: Deno.env.get("STRIPE_PRICE_TEAM"),
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const payload = await req.json().catch(() => ({}));
  const plan = payload?.plan ?? "starter";
  const seatsRaw = Number(payload?.seats ?? 1);
  const seatCount = Number.isFinite(seatsRaw) && seatsRaw > 0 ? Math.floor(seatsRaw) : 1;
  if (!PRICES[plan]) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unknown plan" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing authorization" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  // Ensure billing account for caller
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) {
    return new Response(
      JSON.stringify({ ok: false, error: "Not authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const { data: accId, error: ensureErr } = await supabase.rpc("ensure_billing_account");
  if (ensureErr) {
    console.error("ensure_billing_account error", ensureErr);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to ensure billing account" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const { data: acc, error: accErr } = await supabase
    .from("billing_accounts")
    .select("id, stripe_customer_id")
    .eq("id", accId)
    .single();
  if (accErr) {
    console.error("billing_accounts fetch error", accErr);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to load billing account" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  // Create/ensure Stripe customer
  const customerFetch = await fetch(
    "https://api.stripe.com/v1/customers" + (acc?.stripe_customer_id ? `/${acc.stripe_customer_id}` : ""),
    {
      method: acc?.stripe_customer_id ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: acc?.stripe_customer_id
        ? undefined
        : new URLSearchParams({ "metadata[user_id]": me.user.id }),
    },
  );

  if (!customerFetch.ok) {
    const text = await customerFetch.text();
    console.error("Stripe customer error", text);
    return new Response(text, { status: 400, headers: corsHeaders });
  }

  const customer = await customerFetch.json();
  const customerId = acc?.stripe_customer_id ?? customer.id;

  if (!acc?.stripe_customer_id) {
    const { error: updateErr } = await supabase
      .from("billing_accounts")
      .update({ stripe_customer_id: customerId })
      .eq("id", accId);
    if (updateErr) {
      console.error("billing_accounts update error", updateErr);
    }
  }

  // Create Checkout Session
  const params = new URLSearchParams({
    mode: "subscription",
    success_url: `${ORIGIN}/settings/billing?success=1`,
    cancel_url: `${ORIGIN}/settings/billing?canceled=1`,
    "line_items[0][price]": String(PRICES[plan]),
    "line_items[0][quantity]": String(seatCount),
    customer: customerId,
    allow_promotion_codes: "true",
  });

  const sessionResp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!sessionResp.ok) {
    const text = await sessionResp.text();
    console.error("Stripe checkout error", text);
    return new Response(text, { status: 400, headers: corsHeaders });
  }

  const session = await sessionResp.json();
  return new Response(
    JSON.stringify({ ok: true, url: session.url }),
    { headers: { "Content-Type": "application/json", ...corsHeaders } },
  );
});

