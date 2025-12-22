import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false },
  });

  const { token, user_id } = await req.json();
  if (!token || !user_id) {
    return json({ error: "missing fields" }, 400);
  }

  const { data: invite, error: invErr } = await supabase
    .from("campaign_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (invErr || !invite) return json({ error: "invalid_token" }, 400);
  if (invite.status !== "pending") {
    return json({ error: "invite_not_pending" }, 400);
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabase
      .from("campaign_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return json({ error: "invite_expired" }, 400);
  }

  const { error: memErr } = await supabase.from("campaign_members").upsert({
    campaign_id: invite.campaign_id,
    user_id,
    role: invite.role,
  });

  if (memErr) return json({ error: memErr.message }, 500);

  await supabase
    .from("campaign_invites")
    .update({ status: "accepted", accepted_by: user_id })
    .eq("id", invite.id);

  return json({ ok: true, campaign_id: invite.campaign_id });
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json" },
  });
}





