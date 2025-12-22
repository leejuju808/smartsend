import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response(JSON.stringify({ ok: false, error: "Missing authorization" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: auth } } }
  );

  const { campaign_id, email, role } = await req.json();

  const { data: idRes, error: rpcErr } = await supabase.rpc("create_campaign_invite", {
    p_campaign: campaign_id,
    p_email: email,
    p_role: role,
  });

  if (rpcErr) {
    return new Response(JSON.stringify({ ok: false, error: rpcErr.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { data: invite } = await supabase
    .from("campaign_invites")
    .select("token, expires_at")
    .eq("id", idRes)
    .single();

  if (!invite) {
    return new Response(JSON.stringify({ ok: false, error: "Invite not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const origin = Deno.env.get("APP_ORIGIN") ?? "https://app.smartsendhq.com";
  const link = `${origin}/join?token=${invite.token}`;

  return new Response(JSON.stringify({ ok: true, link, expires_at: invite.expires_at }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});

