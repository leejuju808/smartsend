import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const { token } = body ?? {};
    if (!token) {
      return new Response("Missing token", { status: 400 });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: campaignId, error } = await sb.rpc("accept_campaign_invite", {
      p_token: token,
    });

    if (error) {
      return new Response(error.message, { status: 400 });
    }

    return new Response(JSON.stringify({ campaign_id: campaignId }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("campaign-invite-accept error", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});











