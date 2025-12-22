import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { user_id, account_id, amount = 1 } = await req.json();

    if (!account_id) {
      return new Response(JSON.stringify({ ok: false, reason: "missing_account" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const sb = createClient(SB_URL, SRK);

    const { data: account, error: accountError } = await sb
      .from("billing_accounts")
      .select("id, user_id")
      .eq("id", account_id)
      .maybeSingle();

    if (accountError) throw new Error(accountError.message);
    if (!account) {
      return new Response(JSON.stringify({ ok: false, reason: "account_not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const targetUser = user_id ?? account.user_id ?? null;
    const { data: ent, error } = await sb.rpc("get_entitlements", {
      p_user_id: targetUser,
    });
    if (error) throw new Error(error.message);

    const used = Number(ent?.used_sends ?? 0);
    const max = Number(ent?.monthly_sends ?? 0);
    const canSend = max === 0 ? false : used < max;

    if (!canSend) {
      return new Response(
        JSON.stringify({ ok: false, reason: "quota_exceeded" }),
        {
          status: 402,
          headers: { "content-type": "application/json" },
        },
      );
    }

    const { error: bumpError } = await sb.rpc("bump_usage", {
      p_account: account.id,
      p_kind: "send",
      p_amount: amount,
    });
    if (bumpError) throw new Error(bumpError.message);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return new Response(message, { status: 500 });
  }
});





