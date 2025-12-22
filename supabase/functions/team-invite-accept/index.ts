import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const sb = createClient(SB_URL, SRK);
  const { token, accept_user_id } = await req.json();

  const { data: inv, error: loadError } = await sb
    .from("team_invites")
    .select("*")
    .eq("token", token)
    .eq("canceled", false)
    .lt("expires_at", new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString())
    .maybeSingle();

  if (loadError) {
    return new Response(JSON.stringify({ ok: false, error: loadError.message }), { status: 400 });
  }

  if (!inv) {
    return new Response(JSON.stringify({ ok: false, error: "Invite not found" }), { status: 404 });
  }

  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ ok: false, error: "Invite expired" }), { status: 400 });
  }

  const { data: ok, error: guardError } = await sb.rpc("can_add_member", { p_owner: inv.owner_user_id });
  if (guardError || ok !== true) {
    return new Response(JSON.stringify({ ok: false, error: "Seat limit reached" }), { status: 400 });
  }

  const { data: camps, error: campError } = await sb
    .from("campaigns")
    .select("id")
    .eq("user_id", inv.owner_user_id);

  if (campError) {
    return new Response(JSON.stringify({ ok: false, error: campError.message }), { status: 400 });
  }

  for (const c of camps || []) {
    const { error } = await sb
      .from("campaign_members")
      .insert({
        campaign_id: c.id,
        user_id: accept_user_id,
        role: inv.role,
        added_by: inv.owner_user_id,
        active: true,
      })
      .onConflict("campaign_id,user_id")
      .ignore();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400 });
    }
  }

  const { error: updateError } = await sb
    .from("team_invites")
    .update({ accepted_by: accept_user_id, accepted_at: new Date().toISOString() })
    .eq("id", inv.id);

  if (updateError) {
    return new Response(JSON.stringify({ ok: false, error: updateError.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});











