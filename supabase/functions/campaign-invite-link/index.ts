import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const ORIGIN = Deno.env.get("APP_ORIGIN")!;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ ok: false, error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { campaign_id, email, role } = await req.json();
    if (!campaign_id || !email || !role) {
      return new Response(JSON.stringify({ ok: false, error: "campaign_id, email, and role required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      global: { headers: { Authorization: auth } },
    });

    const { data: token, error } = await sb.rpc("create_campaign_invite", {
      p_campaign: campaign_id,
      p_email: email,
      p_role: role,
    });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const url = token ? `${ORIGIN}/join?token=${encodeURIComponent(String(token))}` : "";

    return new Response(JSON.stringify({ ok: true, url }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("campaign-invite-link error", err);
    return new Response(JSON.stringify({ ok: false, error: "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

