import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ensureGmailAccess } from "../_shared/refreshers.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOPIC = Deno.env.get("GMAIL_PUBSUB_TOPIC")!;

function toIsoExpiry(expiration?: unknown) {
  if (typeof expiration === "string" && /^\d+$/.test(expiration)) {
    const ms = Number(expiration);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (typeof expiration === "number" && Number.isFinite(expiration)) {
    return new Date(expiration).toISOString();
  }
  return new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
}

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
    .select("id, provider, access_token, refresh_token, expires_at, email")
    .eq("id", account_id)
    .maybeSingle();

  if (accErr) {
    return new Response(JSON.stringify({ error: accErr.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  if (!acc || acc.provider !== "gmail") {
    return new Response(JSON.stringify({ error: "no account" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let conn;
  try {
    conn = await ensureGmailAccess(acc);
  } catch (err) {
    return new Response(JSON.stringify({ error: `access_refresh_failed: ${err instanceof Error ? err.message : String(err)}` }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const watchRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName: TOPIC,
      labelIds: ["INBOX"],
      labelFilterAction: "include",
    }),
  });

  const watchJson = await watchRes.json().catch(() => ({}));
  if (!watchRes.ok) {
    return new Response(JSON.stringify({ error: "watch_failed", details: watchJson }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const expiryIso = toIsoExpiry(watchJson.expiration);
  const historyId = watchJson.historyId ? String(watchJson.historyId) : null;

  const { error: upsertErr } = await sb
    .from("account_sync_state")
    .upsert(
      {
        account_id,
        provider: "gmail",
        gmail_history_id: historyId,
        gmail_watch_expiry: expiryIso,
      },
      { onConflict: "account_id" }
    );

  if (upsertErr) {
    return new Response(JSON.stringify({ error: upsertErr.message, result: watchJson }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, result: watchJson, expiry: expiryIso }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});











