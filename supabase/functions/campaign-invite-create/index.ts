import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("PUBLIC_APP_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const { campaign_id, email, role } = body ?? {};

    if (!campaign_id || !email || !role) {
      return new Response("Missing params", { status: 400 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: token, error } = await sb.rpc("create_campaign_invite", {
      p_campaign: campaign_id,
      p_email: email,
      p_role: role,
    });

    if (error) {
      return new Response(error.message, { status: 400 });
    }

    const link = `${APP_URL}/join?token=${encodeURIComponent(token as string)}`;

    return new Response(JSON.stringify({ link }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("campaign-invite-create error", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});











