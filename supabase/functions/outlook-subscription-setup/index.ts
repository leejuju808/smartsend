import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ensureOutlookAccess } from "../_shared/refreshers.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CALLBACK = Deno.env.get("OUTLOOK_NOTIFY_URL")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let payload: { account_id?: string };
  try {
    payload = await req.json();
  } catch (_err) {
    return new Response("invalid json", { status: 400 });
  }

  const account_id = payload?.account_id;
  if (!account_id) {
    return new Response(JSON.stringify({ error: "account_id required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  const { data: acc, error: accErr } = await sb
    .from("connected_accounts")
    .select("id, provider, access_token, refresh_token, expires_at")
    .eq("id", account_id)
    .maybeSingle();

  if (accErr) {
    return new Response(JSON.stringify({ error: accErr.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  if (!acc || acc.provider !== "outlook") {
    return new Response(JSON.stringify({ error: "no account" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let conn;
  try {
    conn = await ensureOutlookAccess(acc);
  } catch (err) {
    return new Response(JSON.stringify({ error: `access_refresh_failed: ${err instanceof Error ? err.message : String(err)}` }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const subscriptionRes = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created,updated",
      notificationUrl: CALLBACK,
      resource: "me/mailFolders('Inbox')/messages",
      expirationDateTime: new Date(Date.now() + 59 * 60 * 1000).toISOString(),
      clientState: "securetoken123",
    }),
  });

  const subscriptionJson = await subscriptionRes.json().catch(() => ({}));
  if (!subscriptionRes.ok) {
    return new Response(JSON.stringify({ error: "subscription_failed", details: subscriptionJson }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { id: subscription_id, expirationDateTime } = subscriptionJson as { id?: string; expirationDateTime?: string };

  const { error: upsertErr } = await sb
    .from("account_sync_state")
    .upsert(
      {
        account_id,
        provider: "outlook",
        outlook_subscription_id: subscription_id ?? null,
        outlook_subscription_expiry: expirationDateTime ?? null,
      },
      { onConflict: "account_id" }
    );

  if (upsertErr) {
    return new Response(JSON.stringify({ error: upsertErr.message, result: subscriptionJson }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, result: subscriptionJson }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});











