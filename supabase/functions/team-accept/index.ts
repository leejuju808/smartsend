// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { token, userId } = body as Record<string, any>;

    if (!token || !userId) {
      return new Response(JSON.stringify({ error: "token and userId are required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { data: invite, error } = await supabase
      .from("team_invites")
      .select("*")
      .eq("token", token)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !invite) {
      return new Response(JSON.stringify({ error: "Invalid or expired invite" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { error: seatErr } = await supabase.rpc("assert_seat_available", {
      p_account: invite.account_id,
    });
    if (seatErr) {
      return new Response(JSON.stringify({ error: seatErr.message }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { error: upsertErr } = await supabase.from("team_members").upsert({
      account_id: invite.account_id,
      user_id: userId,
      role: invite.role,
    });
    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await supabase
      .from("team_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    await supabase.rpc("recompute_seats", { p_account: invite.account_id });

    return new Response(
      JSON.stringify({ ok: true, accountId: invite.account_id }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    console.error("team-accept error", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});




