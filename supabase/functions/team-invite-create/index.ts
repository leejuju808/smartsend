// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ORIGIN = Deno.env.get("APP_ORIGIN")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const sb = createClient(SB_URL, SRK);
  const { owner_user_id, email, role = "editor" } = await req.json();

  const { data: ok, error: seatError } = await sb.rpc("can_add_member", { p_owner: owner_user_id });
  if (seatError || ok !== true) {
    return new Response(
      JSON.stringify({ ok: false, error: "Seat limit reached" }),
      { status: 400 },
    );
  }

  const token = crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const { error } = await sb.from("team_invites").upsert({
    owner_user_id,
    email,
    role,
    token,
    expires_at: expires,
  }, {
    onConflict: "owner_user_id,email",
  });

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 400 },
    );
  }

  const link = `${APP_ORIGIN}/team/accept?token=${token}`;
  return new Response(JSON.stringify({ ok: true, link }), { status: 200 });
});

