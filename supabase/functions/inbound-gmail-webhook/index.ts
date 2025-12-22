import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function decodeEnvelopeData(data: string): any {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  const decoded = atob(padded);
  try {
    return JSON.parse(decoded);
  } catch (_err) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let envelope: any;
  try {
    envelope = await req.json();
  } catch (_err) {
    return new Response("invalid json", { status: 400 });
  }

  const messageData = envelope?.message?.data;
  if (!messageData) {
    return new Response("ok", { status: 200 });
  }

  const msg = decodeEnvelopeData(messageData);
  if (!msg?.emailAddress) {
    return new Response("ok", { status: 200 });
  }

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  const emailAddress = String(msg.emailAddress).toLowerCase();

  const { data: account, error: accErr } = await sb
    .from("connected_accounts")
    .select("id, email, email_address, from_email")
    .eq("provider", "gmail")
    .or(`email.eq.${emailAddress},email_address.eq.${emailAddress},from_email.eq.${emailAddress}`)
    .maybeSingle();

  if (accErr) {
    return new Response(accErr.message, { status: 500 });
  }
  if (!account?.id) {
    return new Response("unknown account", { status: 404 });
  }

  const providerPayload = {
    provider: "gmail",
    account_id: account.id,
    payload: envelope,
  };
  await sb.from("push_events").insert(providerPayload).catch(() => undefined);

  if (msg.historyId) {
    await sb
      .from("account_sync_state")
      .upsert(
        {
          account_id: account.id,
          provider: "gmail",
          gmail_history_id: String(msg.historyId),
        },
        { onConflict: "account_id" }
      )
      .catch(() => undefined);
  }

  await fetch(`${SB_URL}/functions/v1/sync-gmail`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify({ account_id: account.id, source: "gmail-push" }),
  }).catch(() => undefined);

  return new Response("ok", { status: 200 });
});

