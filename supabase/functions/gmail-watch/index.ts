// supabase/functions/gmail-watch/index.ts
// Deploy: supabase functions deploy gmail-watch
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users";
const TOPIC = Deno.env.get("GMAIL_PUBSUB_TOPIC")!; // e.g. projects/<gcp-project>/topics/smartsend-gmail

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function refreshAccessToken(refresh_token: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID, 
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token", 
    refresh_token,
  });
  const r = await fetch(GOOGLE_TOKEN_URL, { method: "POST", body: params });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ access_token: string }>;
}

Deno.serve(async (req) => {
  try {
    const { user_id, email } = await req.json() as { user_id: string; email: string };
    const { data: rows } = await supabase
      .from("user_email_providers")
      .select("*")
      .eq("user_id", user_id)
      .eq("provider", "gmail")
      .eq("email", email)
      .limit(1);

    if (!rows?.length) throw new Error("Account not connected");
    const prov = rows[0];

    const { access_token } = await refreshAccessToken(prov.refresh_token);

    const body = {
      topicName: TOPIC,
      labelIds: ["INBOX"],           // only need inbox
      labelFilterAction: "include",
    };

    const res = await fetch(`${GMAIL_BASE}/me/watch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const watch = await res.json(); // { historyId, expiration }

    await supabase
      .from("user_email_providers")
      .update({ last_history_id: String(watch.historyId) })
      .eq("id", prov.id);

    return new Response(JSON.stringify({ ok: true, watch }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});