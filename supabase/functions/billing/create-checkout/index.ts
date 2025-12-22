// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;
const baseUrl = Deno.env.get("BASE_URL")!; // e.g. https://app.smartsendhq.com
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  try {
    const { user_id, price_id, success_url, cancel_url } = await req.json();
    if (!user_id || !price_id) return new Response("missing params", { status:400 });

    // ensure billing account
    const { data: acc } = await sb.from("billing_accounts").select("*").eq("user_id", user_id).maybeSingle();
    let customerId = acc?.stripe_customer_id;
    if (!customerId) {
      const c = await fetch("https://api.stripe.com/v1/customers", {
        method:"POST",
        headers:{ Authorization:`Bearer ${stripeSecret}` },
        body: new URLSearchParams({ email: `${user_id}@smartsend.fake` })
      }).then(r=>r.json());
      customerId = c.id;
      await sb.from("billing_accounts").upsert({ user_id, stripe_customer_id: customerId });
    }

    const params = new URLSearchParams({
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": price_id,
      "line_items[0][quantity]": "1",
      success_url: success_url ?? `${baseUrl}/billing?status=success`,
      cancel_url: cancel_url ?? `${baseUrl}/billing?status=cancel`
    });

    const session = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method:"POST",
      headers:{ Authorization:`Bearer ${stripeSecret}` },
      body: params
    }).then(r=>r.json());

    return new Response(JSON.stringify({ url: session.url }), { headers: { "content-type":"application/json" } });
  } catch(e) {
    return new Response(String(e), { status:500 });
  }
});
