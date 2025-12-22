import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;
const baseUrl = Deno.env.get("BASE_URL")!;

Deno.serve(async (req) => {
  const { customer_id } = await req.json();
  if (!customer_id) return new Response("missing customer_id",{status:400});
  const portal = await fetch("https://api.stripe.com/v1/billing_portal/sessions",{
    method:"POST",
    headers:{Authorization:`Bearer ${stripeSecret}`},
    body:new URLSearchParams({
      customer:customer_id,
      return_url:`${baseUrl}/billing`
    })
  }).then(r=>r.json());
  return new Response(JSON.stringify({url:portal.url}),{headers:{"content-type":"application/json"}});
});
