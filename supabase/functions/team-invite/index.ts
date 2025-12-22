// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function token(length = 40) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

serve(async (req) => {
  const jsonHeaders = { "content-type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { accountId, email, role = "viewer", invitedBy } = body as Record<string, any>;

    if (!accountId || !email || !invitedBy) {
      return new Response(JSON.stringify({ error: "accountId, email, and invitedBy are required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { error: seatErr } = await supabase.rpc("assert_seat_available", { p_account: accountId });
    if (seatErr) {
      return new Response(JSON.stringify({ error: seatErr.message }), { status: 400, headers: jsonHeaders });
    }

    const tok = token();
    const { data, error } = await supabase
      .from("team_invites")
      .insert({
        account_id: accountId,
        email,
        role,
        invited_by: invitedBy,
        token: tok,
      })
      .select("id, token, expires_at")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: jsonHeaders });
    }

    // TODO: send invite email via provider (Resend/Postmark/etc.)
    return new Response(
      JSON.stringify({ ok: true, token: data.token, expiresAt: data.expires_at }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    console.error("team-invite error", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});
