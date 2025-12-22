import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { campaign_id?: string };
  try {
    payload = await req.json();
  } catch (_err) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { campaign_id } = payload;
  if (!campaign_id) {
    return new Response("Missing campaign_id", { status: 400 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: auth } },
    }
  );

  const { data, error } = await sb.rpc("get_campaign_analytics", { p_campaign: campaign_id });
  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
});





