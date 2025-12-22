import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Account = {
  id: string;
  provider: "gmail" | "outlook";
  email_address: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  provider_meta: Record<string, unknown> | null;
};

type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name?: string; value?: string }>;
  };
  snippet?: string;
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (cronSecret && url.searchParams.get("key") !== cronSecret) {
    return new Response("forbidden", { status: 403 });
  }

  const accountId = url.searchParams.get("account_id");
  let accounts: Account[] = [];

  if (accountId) {
    const { data, error } = await sb
      .from("accounts")
      .select("*")
      .eq("provider", "gmail")
      .eq("id", accountId);
    if (error) return json({ error: error.message }, 500);
    accounts = (data ?? []) as Account[];
  } else {
    const { data, error } = await sb
      .from("accounts")
      .select("*")
      .eq("provider", "gmail");
    if (error) return json({ error: error.message }, 500);
    accounts = (data ?? []) as Account[];
  }

  if (!accounts.length) {
    return json({ ok: true, processed: 0 });
  }

  let processed = 0;

  for (const acc of accounts) {
    try {
      const token = await ensureGmailToken(acc);
      const state = await getState(acc.id, "gmail");
      const nextHistoryId = await syncGmail(acc, token, state?.cursor ?? null);
      await sb
        .from("mail_sync_state")
        .upsert(
          {
            account_id: acc.id,
            provider: "gmail",
            cursor: nextHistoryId ?? null,
            last_synced_at: new Date().toISOString(),
            error: null,
          },
          { onConflict: "account_id" }
        );
      processed++;
    } catch (err) {
      console.error("gmail-sync error", acc.id, err);
      await sb
        .from("mail_sync_state")
        .upsert(
          {
            account_id: acc.id,
            provider: "gmail",
            error: err instanceof Error ? err.message : String(err),
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "account_id" }
        );
    }
  }

  return json({ ok: true, processed });
});

async function getState(accountId: string, provider: string) {
  const { data } = await sb
    .from("mail_sync_state")
    .select("*")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .maybeSingle();
  return data ?? null;
}

async function ensureGmailToken(acc: Account): Promise<string> {
  const exp = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0;
  if (acc.access_token && exp - Date.now() > 60_000) {
    return acc.access_token;
  }
  if (!acc.refresh_token) {
    throw new Error("no refresh token");
  }

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: acc.refresh_token,
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body,
  });
  if (!resp.ok) {
    throw new Error(`gmail refresh failed (${resp.status})`);
  }
  const jsonBody = await resp.json();
  const access_token = jsonBody.access_token as string;
  const expires_in = Number(jsonBody.expires_in ?? 3600);
  const token_expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

  await sb
    .from("accounts")
    .update({ access_token, token_expires_at })
    .eq("id", acc.id);

  return access_token;
}

async function syncGmail(
  acc: Account,
  accessToken: string,
  historyId: string | null
) {
  // Seed initial state if no cursor yet
  if (!historyId) {
    const list = await gmailList(accessToken, 25);
    for (const message of list.messages ?? []) {
      await ingestGmailMessage(acc, accessToken, message.id);
    }
    return list.historyId ?? list.resultSizeEstimate?.toString() ?? null;
  }

  let nextHistoryId = historyId;
  let pageToken: string | undefined;

  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
    url.searchParams.set("startHistoryId", nextHistoryId);
    url.searchParams.set("historyTypes", "messageAdded");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      throw new Error(`gmail history ${resp.status}`);
    }

    const json = await resp.json();
    const history = json.history ?? [];
    for (const entry of history) {
      const added = (entry.messagesAdded ?? []).map((x: { message: GmailMessage }) => x.message);
      for (const msg of added) {
        await ingestGmailMessage(acc, accessToken, msg.id);
      }
    }

    nextHistoryId = json.historyId ?? nextHistoryId;
    pageToken = json.nextPageToken;
  } while (pageToken);

  return nextHistoryId;
}

async function gmailList(accessToken: string, maxResults = 25) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("q", "newer_than:7d");

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`gmail list ${resp.status}`);
  }

  const json = await resp.json();

  const profileResp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (profileResp.ok) {
    const profile = await profileResp.json();
    (json as any).historyId = profile.historyId;
  }

  return json;
}

async function ingestGmailMessage(
  acc: Account,
  accessToken: string,
  messageId: string
) {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!resp.ok) {
    throw new Error(`gmail get ${resp.status}`);
  }

  const message: GmailMessage = await resp.json();
  const headers = headerMap(message);

  const from = headers["from"] ?? "";
  const to = headers["to"] ?? "";
  const subject = headers["subject"] ?? null;
  const direction = normalizeDirection(acc.email_address, from, to);
  const sentAt = headers["date"]
    ? new Date(headers["date"]).toISOString()
    : new Date(Number(message.internalDate || Date.now())).toISOString();

  const thread = await sb.rpc("upsert_thread_from_provider", {
    p_account: acc.id,
    p_provider: "gmail",
    p_provider_thread_id: message.threadId,
    p_subject: subject,
    p_lead_email: direction === "inbound" ? emailOnly(from) : emailOnly(to),
  });
  if (thread.error) {
    throw new Error(thread.error.message);
  }

  const inserted = await sb.rpc("ensure_normalized_message", {
    p_thread: thread.data,
    p_provider: "gmail",
    p_provider_message_id: message.id,
    p_provider_thread_id: message.threadId,
    p_direction: direction,
    p_subject: subject,
    p_body_text: message.snippet ?? null,
    p_body_html: null,
    p_sent_at: sentAt,
  });
  if (inserted.error) {
    throw new Error(inserted.error.message);
  }
}

function headerMap(msg: GmailMessage): Record<string, string> {
  const headers = msg.payload?.headers ?? [];
  const out: Record<string, string> = {};
  for (const h of headers) {
    if (!h?.name) continue;
    out[h.name.toLowerCase()] = h.value ?? "";
  }
  return out;
}

function emailOnly(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function normalizeDirection(me: string, from: string, to: string) {
  const meLower = me.toLowerCase();
  const fromLower = (from || "").toLowerCase();
  const toLower = (to || "").toLowerCase();
  return fromLower.includes(meLower) ? "outbound" : "inbound";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}



