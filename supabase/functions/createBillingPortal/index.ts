import Stripe from "https://esm.sh/stripe@14.23.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: "2023-10-16",
});
const SECRET = Deno.env.get("BILLING_SECRET")!;

Deno.serve(async (req) => {
  // Security check
  if (req.headers.get("x-ss-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const { teamId } = await req.json();
  if (!teamId) {
    return new Response("teamId required", { status: 400 });
  }

  // Get billing customer for team
  const { data: bc, error } = await sb.from("billing_customers")
    .select("stripe_customer_id")
    .eq("team_id", teamId)
    .maybeSingle();

  if (error || !bc?.stripe_customer_id) {
    return new Response("no customer found for team", { status: 400 });
  }

  const RETURN_URL = Deno.env.get("BILLING_RETURN_URL") || "https://app.smartsendhq.com/settings/billing";

  const portal = await stripe.billingPortal.sessions.create({
    customer: bc.stripe_customer_id,
    return_url: RETURN_URL
  });

  return new Response(JSON.stringify({ url: portal.url }), {
    headers: { "Content-Type": "application/json" }
  });
});

