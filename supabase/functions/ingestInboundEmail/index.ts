import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const body = await req.json();
  // You can transform your Gmail/Outlook webhook → the Inbound payload expected by classifyEmail here.
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/classifyEmail`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const out = await res.text();
  return new Response(out, { headers: { "Content-Type": "application/json" }, status: res.status });
});
