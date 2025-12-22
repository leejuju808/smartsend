// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
function sb() {
  return createClient(URL, KEY, { auth: { persistSession: false } });
}

async function ensureToken(acc: any) {
  const expMs = acc.expires_at ? new Date(acc.expires_at).getTime() : 0;
  if (acc.access_token && expMs - Date.now() > 5 * 60_000) return acc.access_token;

  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: acc.refresh_token!,
      scope: "https://graph.microsoft.com/.default offline_access",
      redirect_uri: Deno.env.get("MS_REDIRECT_URI")!,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || "outlook refresh failed");
  const tok = j.access_token as string;
  const exp = new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString();
  await sb()
    .from("connected_accounts")
    .update({ access_token: tok, expires_at: exp })
    .eq("id", acc.id);
  return tok;
}

function strip(html?: string) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 5000);
}

async function upsertInbound(acc: any, msg: any) {
  const supa = sb();
  const subject = msg.subject ?? "";
  const html = msg.body?.content ?? "";
  const preview = strip(html).slice(0, 300);
  const from = msg.from?.emailAddress?.address ?? "";
  const to = msg.toRecipients?.[0]?.emailAddress?.address ?? "";
  const sentAt = msg.receivedDateTime ?? msg.sentDateTime ?? new Date().toISOString();
  const convId = msg.conversationId ?? msg.id;

  // inbound if From != account email
  const inbound = !from.toLowerCase().includes(String(acc.email).toLowerCase());
  if (!inbound) return;

  // resolve/create lead
  const { data: leadRow } = await supa.from("leads").select("id").eq("email", from).maybeSingle();
  const leadId =
    leadRow?.id ??
    (
      await supa
        .from("leads")
        .insert({ email: from })
        .select("id")
        .maybeSingle()
    ).data?.id;

  // existing thread?
  const { data: t } = await supa
    .from("inbox_threads")
    .select("id, campaign_id")
    .eq("provider", "outlook")
    .eq("provider_thread_id", convId)
    .maybeSingle();

  const toEmail = to ?? "";
  const { data: resolved } = await supa.rpc("resolve_campaign_for_inbound", {
    p_account: acc.id,
    p_to: toEmail,
  });

  const campaignId = t?.campaign_id ?? resolved ?? null;

  // thread & message
  const { data: threadId } = await supa.rpc("find_or_create_thread", {
    p_provider: "outlook",
    p_provider_thread_id: convId,
    p_account: acc.id,
    p_campaign: campaignId,
    p_lead: leadId,
  });

  await supa.rpc("upsert_inbound_message", {
    p_provider: "outlook",
    p_provider_message_id: msg.id,
    p_thread: threadId,
    p_campaign: campaignId,
    p_lead: leadId,
    p_subject: subject,
    p_html: html,
    p_preview: preview,
    p_from_email: from,
    p_to_email: to,
    p_sent_at: new Date(sentAt).toISOString(),
  });
}

async function fetchDelta(token: string, deltaUrl?: string) {
  const url = deltaUrl || "https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$top=25";
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || "delta failed");
  return j;
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account");

  const supa = sb();
  let q = supa
    .from("connected_accounts")
    .select("id, provider, email, access_token, refresh_token, expires_at, outlook_delta_url")
    .eq("provider", "outlook");
  if (accountId) q = q.eq("id", accountId);
  const { data: accounts, error } = await q;
  if (error) return new Response(error.message, { status: 500 });

  let processed = 0;

  for (const acc of accounts ?? []) {
    try {
      const token = await ensureToken(acc);
      let page = await fetchDelta(token, acc.outlook_delta_url ?? undefined);

      while (true) {
        const msgs = page.value ?? [];
        for (const m of msgs) {
          // skip deletes/changes without body
          if (m["@removed"]) continue;
          await upsertInbound(acc, m);
          processed++;
        }

        // next page?
        const next = page["@odata.nextLink"];
        const delta = page["@odata.deltaLink"];
        if (next) {
          page = await fetchDelta(token, next);
          continue;
        }
        if (delta) {
          await supa
            .from("connected_accounts")
            .update({
              outlook_delta_url: delta,
              last_sync_at: new Date().toISOString(),
            })
            .eq("id", acc.id);
        }
        break;
      }
    } catch (_e) {
      // continue other accounts
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { "content-type": "application/json" },
  });
});

