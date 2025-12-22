// supabase/functions/send_gmail/index.ts

// Deno / Edge Function: send Gmail message using connected_accounts row
// - Auto refreshes Google OAuth tokens if expired/401
// - Retries on 429/5xx with exponential backoff
// - Returns { id, threadId } on success

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js";

type Payload = {
  connected_account_id: string; // UUID in connected_accounts
  to: string;
  from?: string; // optional override; otherwise use account.email
  subject: string;
  body: string; // plain text for now
  raw_base64url?: string; // if present, use as-is and ignore subject/body
  threadId?: string; // optional: reply within existing thread
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function makeRawBase64Url({
  from,
  to,
  subject,
  body,
}: {
  from: string;
  to: string;
  subject: string;
  body: string;
}) {
  const rfc822 =
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
    `${body}`;
  // base64url
  const bytes = new TextEncoder().encode(rfc822);
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function refreshGoogleToken(refresh_token: string) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  const access_token: string = j.access_token;
  const expires_in: number = j.expires_in ?? 3600;
  const expires_at = new Date(Date.now() + (expires_in - 60) * 1000).toISOString(); // minus 60s guard
  return { access_token, expires_at };
}

// Generic retry helper (max ~3 attempts, 250ms base)
async function withRetries<T>(fn: () => Promise<T>): Promise<T> {
  let delay = 250;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = `${err?.message ?? err}`;
      const retriable = /429|5\d\d|rate|temporar/i.test(msg);
      if (!retriable || attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 120)));
      delay *= 2;
    }
  }
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as Payload;

    if (!payload.connected_account_id)
      return new Response(JSON.stringify({ error: "connected_account_id required" }), { status: 400 });

    // 1) Load account
    const { data: acct, error: acctErr } = await sb
      .from("connected_accounts")
      .select("id, provider, email, access_token, refresh_token, expires_at")
      .eq("id", payload.connected_account_id)
      .maybeSingle();

    if (acctErr) throw new Error(acctErr.message);
    if (!acct) return new Response(JSON.stringify({ error: "connected account not found" }), { status: 404 });
    if (acct.provider !== "gmail")
      return new Response(JSON.stringify({ error: "provider not gmail" }), { status: 400 });

    let access_token = acct.access_token as string | null;
    const refresh_token = acct.refresh_token as string | null;
    const accountEmail = acct.email as string;

    // 2) Refresh if expired (coarse check)
    const exp = acct.expires_at ? new Date(acct.expires_at).getTime() : 0;
    if (Date.now() >= exp && refresh_token) {
      const refreshed = await refreshGoogleToken(refresh_token);
      access_token = refreshed.access_token;
      await sb
        .from("connected_accounts")
        .update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at })
        .eq("id", acct.id);
    }

    if (!access_token)
      return new Response(JSON.stringify({ error: "no access token and cannot refresh" }), { status: 401 });

    const from = payload.from ?? accountEmail;
    const raw =
      payload.raw_base64url ??
      makeRawBase64Url({
        from,
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
      });

    // 3) Call Gmail API with retries; if 401, try one forced refresh
    const doSend = async () => {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/send?alt=json`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          raw,
          ...(payload.threadId ? { threadId: payload.threadId } : {}),
        }),
      });

      if (res.status === 401 && refresh_token) {
        // one forced refresh path
        const refreshed = await refreshGoogleToken(refresh_token);
        access_token = refreshed.access_token;
        await sb
          .from("connected_accounts")
          .update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at })
          .eq("id", acct.id);

        const res2 = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${access_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            raw,
            ...(payload.threadId ? { threadId: payload.threadId } : {}),
          }),
        });
        if (!res2.ok) throw new Error(`gmail send failed (after refresh): ${res2.status} ${await res2.text()}`);
        return res2.json();
      }

      if (!res.ok) throw new Error(`gmail send failed: ${res.status} ${await res.text()}`);
      return res.json();
    };

    const j = await withRetries(doSend);

    return new Response(JSON.stringify({ id: j.id, threadId: j.threadId }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "unknown error" }), { status: 500 });
  }
});

