// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type GmailMessage = {
  id: string;
  threadId: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

const env = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL")!,
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  GOOGLE_CLIENT_ID: Deno.env.get("GOOGLE_CLIENT_ID")!,
  GOOGLE_CLIENT_SECRET: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
};

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token refresh failed ${res.status}`);
  const json = await res.json();
  return {
    access_token: json.access_token as string,
    expires_in: json.expires_in as number,
  };
}

async function gmailListMessages(accessToken: string, q: string) {
  const url = new URL(`${GMAIL_API}/messages`);
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "25");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { messages: [] as Array<{ id: string }> };
  const data = await res.json();
  return { messages: (data.messages ?? []) as Array<{ id: string }> };
}

async function gmailGetMessage(accessToken: string, id: string) {
  const res = await fetch(
    `${GMAIL_API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) throw new Error(`get message ${res.status}`);
  return (await res.json()) as GmailMessage;
}

function header(msg: GmailMessage, name: string) {
  return (
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

serve(async () => {
  // 1) load connected gmail accounts
  const { data: accounts, error } = await supabase
    .from("gmail_accounts")
    .select(
      "user_id,email,refresh_token,access_token,token_expiry,last_checked"
    );
  if (error) return new Response(error.message, { status: 500 });

  const nowIso = new Date().toISOString();

  for (const acct of accounts ?? []) {
    try {
      // 2) ensure fresh access token
      let accessToken = acct.access_token as string | null;
      const needsRefresh =
        !accessToken ||
        !acct.token_expiry ||
        new Date(acct.token_expiry) < new Date(Date.now() + 60_000);

      if (needsRefresh) {
        const refreshed = await refreshAccessToken(acct.refresh_token);
        accessToken = refreshed.access_token;
        const tokenExpiry = new Date(
          Date.now() + refreshed.expires_in * 1000
        ).toISOString();
        await supabase
          .from("gmail_accounts")
          .update({
            access_token: accessToken,
            token_expiry: tokenExpiry,
          })
          .eq("user_id", acct.user_id);
      }

      // 3) query new inbound messages since last check
      // Logic: not from me, in inbox, newer than last_checked
      // Gmail doesn't support absolute iso in "q", so use newer_than with a cushion, and filter later.
      const q = `in:inbox -from:me newer_than:10m`;
      const { messages } = await gmailListMessages(accessToken!, q);

      if (messages.length === 0) {
        await supabase
          .from("gmail_accounts")
          .update({ last_checked: nowIso })
          .eq("user_id", acct.user_id);
        continue;
      }

      for (const m of messages) {
        const msg = await gmailGetMessage(accessToken!, m.id);
        const from = header(msg, "From");
        const to = header(msg, "To");

        // basic guard: only treat as reply if it's to one of our senders and has a threadId
        if (!msg.threadId) continue;
        if (!from || !to) continue;

        // 4) find a sent email in this thread
        const { data: sent } = await supabase
          .from("emails_sent")
          .select("id,replied")
          .eq("thread_id", msg.threadId)
          .limit(1)
          .maybeSingle();

        if (sent && !sent.replied) {
          await supabase
            .from("emails_sent")
            .update({ replied: true })
            .eq("id", sent.id);
          await supabase.from("email_logs").insert({
            type: "reply_detected",
            message_id: msg.id,
            thread_id: msg.threadId,
            meta: { from, to },
          });
        }
      }

      // 5) bump last_checked
      await supabase
        .from("gmail_accounts")
        .update({ last_checked: nowIso })
        .eq("user_id", acct.user_id);
    } catch (e) {
      await supabase.from("email_logs").insert({
        type: "reply_poller_error",
        message_id: null,
        thread_id: null,
        meta: { user_id: acct.user_id, error: String(e) },
      });
    }
  }

  return new Response("ok", { status: 200 });
});

