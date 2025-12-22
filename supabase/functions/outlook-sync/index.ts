import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Account = {
  id: string;
  provider: "gmail" | "outlook";
  email_address: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  provider_meta: { tenant?: string } | null;
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID")!;
const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (cronSecret && url.searchParams.get("key") !== cronSecret) {
    return new Response("forbidden", { status: 403 });
  }

  const { data, error } = await sb
    .from("accounts")
    .select("*")
    .eq("provider", "outlook");
  if (error) return json({ error: error.message }, 500);

  const accounts = (data ?? []) as Account[];
  if (!accounts.length) return json({ ok: true, processed: 0 });

  let processed = 0;

  for (const acc of accounts) {
    try {
      const token = await ensureOutlookToken(acc);
      const state = await getState(acc.id, "outlook");
      const initialUrl =
        state?.cursor ??
        "https://graph.microsoft.com/v1.0/me/messages/delta?$select=conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview";

      let nextLink: string | null = initialUrl;

      while (nextLink) {
        const resp = await fetch(nextLink, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error(`graph delta ${resp.status}`);

        const json = await resp.json();
        const items = json.value ?? [];
        for (const message of items) {
          await ingestOutlook(acc, message);
        }

        nextLink = json["@odata.nextLink"] ?? null;
        const delta = json["@odata.deltaLink"] ?? null;
        if (!nextLink && delta) {
          nextLink = delta;
        }
      }

      await sb
        .from("mail_sync_state")
        .upsert(
          {
            account_id: acc.id,
            provider: "outlook",
            cursor: nextLink,
            last_synced_at: new Date().toISOString(),
            error: null,
          },
          { onConflict: "account_id" }
        );

      processed++;
    } catch (err) {
      console.error("outlook-sync error", acc.id, err);
      await sb
        .from("mail_sync_state")
        .upsert(
          {
            account_id: acc.id,
            provider: "outlook",
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

async function ensureOutlookToken(acc: Account): Promise<string> {
  const exp = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0;
  if (acc.access_token && exp - Date.now() > 60_000) {
    return acc.access_token;
  }
  if (!acc.refresh_token) throw new Error("no refresh token");

  const tenant = acc.provider_meta?.tenant ?? "common";
  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: acc.refresh_token,
    scope: "https://graph.microsoft.com/.default offline_access",
  });

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    { method: "POST", body }
  );
  if (!resp.ok) {
    throw new Error(`outlook refresh failed (${resp.status})`);
  }

  const json = await resp.json();
  const access_token = json.access_token as string;
  const expires_in = Number(json.expires_in ?? 3600);
  const token_expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

  await sb
    .from("accounts")
    .update({ access_token, token_expires_at })
    .eq("id", acc.id);

  return access_token;
}

async function ingestOutlook(acc: Account, message: any) {
  const convId = message.conversationId as string;
  const subject = (message.subject ?? null) as string | null;
  const from = message.from?.emailAddress?.address ?? "";
  const to = (message.toRecipients?.[0]?.emailAddress?.address ?? "") as string;
  const sentAt = message.receivedDateTime
    ? new Date(message.receivedDateTime).toISOString()
    : new Date().toISOString();
  const direction = normalizeDirection(acc.email_address, from, to);

  const thread = await sb.rpc("upsert_thread_from_provider", {
    p_account: acc.id,
    p_provider: "outlook",
    p_provider_thread_id: convId,
    p_subject: subject,
    p_lead_email: direction === "inbound" ? from : to,
  });
  if (thread.error) {
    throw new Error(thread.error.message);
  }

  const inserted = await sb.rpc("ensure_normalized_message", {
    p_thread: thread.data,
    p_provider: "outlook",
    p_provider_message_id: message.id,
    p_provider_thread_id: convId,
    p_direction: direction,
    p_subject: subject,
    p_body_text: message.bodyPreview ?? null,
    p_body_html: null,
    p_sent_at: sentAt,
  });
  if (inserted.error) {
    throw new Error(inserted.error.message);
  }
}

function normalizeDirection(me: string, from: string, to: string) {
  const meLower = me.toLowerCase();
  return (from || "").toLowerCase().includes(meLower) ? "outbound" : "inbound";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
