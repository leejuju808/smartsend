// supabase/functions/send_gmail_reply/index.ts
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface Payload {
  user_id: string;
  reply_id: string;        // the thread item you're replying to (our replies.id)
  to: string;              // recipient
  subject: string;
  body: string;            // plain text for now
  threadId?: string;       // Gmail threadId if you store it; optional
  inReplyTo?: string;      // original Gmail message-id (for headers)
  references?: string;     // references header chain
  from_email?: string;     // optional override, otherwise we use connected account email
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function toBase64Url(input: string) {
  const b64 = btoa(unescape(encodeURIComponent(input)));
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

Deno.serve(async (req) => {
  try {
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { fetch } }
    );

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

    const payload: Payload = await req.json();

    // 1) Load Gmail account/token
    const { data: ga, error: gaErr } = await supabaseClient
      .from("gmail_accounts")
      .select("*")
      .eq("user_id", payload.user_id)
      .limit(1)
      .single();

    if (gaErr || !ga) {
      return new Response(JSON.stringify({ error: "No Gmail account connected." }), { status: 400 });
    }

    // 2) Refresh token if needed
    let accessToken = ga.access_token as string;
    const expired = new Date(ga.expiry) <= new Date();

    if (expired) {
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: ga.refresh_token,
        }),
      });
      if (!tokenRes.ok) {
        const t = await tokenRes.text();
        return new Response(JSON.stringify({ error: "Token refresh failed", detail: t }), { status: 400 });
      }
      const tokenJson = await tokenRes.json();
      accessToken = tokenJson.access_token;

      // store new access + expiry
      const newExpiry = new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000).toISOString();
      await supabaseClient.from("gmail_accounts").update({
        access_token: accessToken, expiry: newExpiry
      }).eq("id", ga.id);
    }

    // 3) Build RFC822 email (reply)
    const from = payload.from_email ?? ga.email_address;
    const headers: string[] = [
      `From: ${from}`,
      `To: ${payload.to}`,
      `Subject: ${payload.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
    ];
    if (payload.inReplyTo) headers.push(`In-Reply-To: ${payload.inReplyTo}`);
    if (payload.references) headers.push(`References: ${payload.references}`);

    const raw = `${headers.join("\r\n")}\r\n\r\n${payload.body}`;

    // 4) Send via Gmail
    const sendUrl = payload.threadId
      ? `${GMAIL_SEND_URL}?threadId=${encodeURIComponent(payload.threadId)}`
      : GMAIL_SEND_URL;

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: toBase64Url(raw) }),
    });

    const sendJson = await sendRes.json();
    if (!sendRes.ok) {
      return new Response(JSON.stringify({ error: "Gmail send failed", detail: sendJson }), { status: 400 });
    }

    // 5) Log sent message
    await supabaseClient.from("sent_messages").insert({
      user_id: payload.user_id,
      reply_id: payload.reply_id,
      gmail_message_id: sendJson.id,
    });

    return new Response(JSON.stringify({ ok: true, gmail: sendJson }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

