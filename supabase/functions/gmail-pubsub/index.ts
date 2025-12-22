// supabase/functions/gmail-pubsub/index.ts
// Deploy: supabase functions deploy gmail-pubsub
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users";
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

// (Optional) quick heuristic intent tags
function inferIntent(subject: string, body: string) {
  const s = (subject + " " + body).toLowerCase();
  if (/\b(out of office|automatic reply|away)\b/.test(s)) return "ooo";
  if (/\b(undeliver|failure notice|mailer-daemon|bounce)\b/.test(s)) return "bounce";
  if (/\b(yes|let's talk|interested|sounds good|book|schedule)\b/.test(s)) return "positive";
  return "neutral";
}

async function refreshAccessToken(refresh_token: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token,
  });
  const r = await fetch(GOOGLE_TOKEN_URL, { method: "POST", body: params });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ access_token: string; expires_in: number }>;
}

function b64urlDecode(s: string) {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

type PubSubPush = {
  message?: { data?: string };
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as PubSubPush;
    const dataStr = payload?.message?.data ? b64urlDecode(payload.message.data) : "";
    // Example Gmail pubsub message: { emailAddress: "...", historyId: "12345" }
    const note = dataStr ? JSON.parse(dataStr) as { emailAddress: string; historyId: string } : null;
    if (!note?.emailAddress || !note?.historyId) {
      return new Response(JSON.stringify({ ok: true, skip: "no data" }), { status: 200 });
    }

    // Find connected provider row by email
    const { data: provs, error: provErr } = await supabase
      .from("user_email_providers")
      .select("*")
      .eq("provider", "gmail")
      .eq("email", note.emailAddress)
      .limit(1);
    if (provErr || !provs?.length) throw new Error("Gmail provider not found for emailAddress");
    const prov = provs[0];

    // Refresh token and fetch history since last_history_id (or start at current)
    const { access_token } = await refreshAccessToken(prov.refresh_token);

    const historyParams = new URLSearchParams({
      maxResults: "100",
      startHistoryId: prov.last_history_id ?? note.historyId,
      historyTypes: "messageAdded",
      labelId: "INBOX",
    });

    const histRes = await fetch(`${GMAIL_BASE}/me/history?${historyParams}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    // If startHistoryId is too old, Gmail returns 404; reset to current and exit gracefully
    if (histRes.status === 404) {
      await supabase.from("user_email_providers")
        .update({ last_history_id: note.historyId })
        .eq("id", prov.id);
      return new Response(JSON.stringify({ ok: true, reset: true }), { status: 200 });
    }

    if (!histRes.ok) throw new Error(`history.list: ${await histRes.text()}`);
    const history = await histRes.json() as any;

    // Iterate over added messages
    const messageIds: string[] = [];
    for (const h of history.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m?.message?.id) messageIds.push(m.message.id);
      }
    }

    const touched: string[] = [];

    for (const mid of messageIds) {
      // Get full message with headers + threadId + snippet
      const msgRes = await fetch(`${GMAIL_BASE}/me/messages/${mid}?format=full`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();

      const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
      const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";

      const from = h("From");
      const to = h("To");
      const subject = h("Subject") || "";
      const inReplyTo = h("In-Reply-To") || "";
      const references = h("References") || "";
      const threadId = msg.threadId as string | undefined;

      // Only consider emails FROM the lead (not from our account)
      const isInbound = from && !from.toLowerCase().includes(note.emailAddress.toLowerCase());
      if (!isInbound) continue;

      // Try to match to a sent email log by:
      // 1) provider_message_id in In-Reply-To/References OR
      // 2) same provider_thread_id
      let match = null;

      if (inReplyTo || references) {
        const token = (inReplyTo || references).replace(/[<>]/g, "");
        const { data: hit1 } = await supabase
          .from("email_logs")
          .select("id")
          .eq("provider_message_id", token)
          .limit(1);
        match = hit1?.[0] ?? null;
      }

      if (!match && threadId) {
        const { data: hit2 } = await supabase
          .from("email_logs")
          .select("id")
          .eq("provider_thread_id", threadId)
          .order("created_at", { ascending: false })
          .limit(1);
        match = hit2?.[0] ?? null;
      }

      if (match) {
        const snippet = (msg.snippet as string) ?? "";
        const intent = inferIntent(subject, snippet);

        await supabase
          .from("email_logs")
          .update({
            replied_at: new Date().toISOString(),
            status: "replied",
            reply_intent: intent,
            reply_snippet: snippet.slice(0, 500),
          })
          .eq("id", match.id)
          .is("replied_at", null);

        touched.push(match.id);
      }
    }

    // Save latest historyId for next delta
    const latest = history.historyId ?? note.historyId;
    await supabase
      .from("user_email_providers")
      .update({ last_history_id: String(latest) })
      .eq("id", prov.id);

    return new Response(JSON.stringify({ ok: true, matched: touched.length }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});