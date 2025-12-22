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

  // refresh
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: acc.refresh_token!,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || "gmail refresh failed");
  const tok = j.access_token as string;
  const exp = new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString();
  await sb()
    .from("connected_accounts")
    .update({ access_token: tok, expires_at: exp })
    .eq("id", acc.id);
  return tok;
}

function headerValue(payload: any, name: string) {
  const h = payload?.headers?.find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}
function decodeBody(part: any): string {
  if (!part) return "";
  if (part.body?.data) {
    try {
      return decodeURIComponent(escape(atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"))));
    } catch {
      return "";
    }
  }
  if (part.parts) return part.parts.map(decodeBody).join("\n");
  return "";
}
function pickHtml(payload: any): { html: string; text: string } {
  const parts = payload?.parts || [];
  let html = "", text = "";
  const walk = (p: any) => {
    if (p.mimeType === "text/html") html += decodeBody(p);
    if (p.mimeType === "text/plain") text += decodeBody(p);
    (p.parts ?? []).forEach(walk);
  };
  parts.forEach(walk);
  if (!html) html = text ? `<pre>${text}</pre>` : "";
  return { html, text };
}

async function upsertInbound({ acc, token, msg, threadId, subject }: any) {
  // parse headers
  const from = headerValue(msg.payload, "From");
  const to = headerValue(msg.payload, "To");
  const date = headerValue(msg.payload, "Date");
  const sentAt = date ? new Date(date).toISOString() : new Date().toISOString();

  const { html, text } = pickHtml(msg.payload);
  const preview = (text || html.replace(/<[^>]+>/g, " ")).slice(0, 300);

  // infer direction (inbound if From != account email)
  const inbound = !from.toLowerCase().includes(String(acc.email).toLowerCase());
  if (!inbound) return; // skip outbounds (your send engine already logs those)

  // resolve lead by email
  const leadEmail = /<([^>]+)>/.exec(from)?.[1] || from;
  const supa = sb();
  let lead = await supa.from("leads").select("id").eq("email", leadEmail).maybeSingle();
  if (!lead.data) {
    // create minimal lead (optional)
    const ins = await supa
      .from("leads")
      .insert({ email: leadEmail, first_name: null, last_name: null })
      .select("id")
      .maybeSingle();
    lead = { data: ins.data };
  }
  const leadId = lead.data?.id;

  const existing = await supa
    .from("inbox_threads")
    .select("id, campaign_id")
    .eq("provider", "gmail")
    .eq("provider_thread_id", threadId)
    .maybeSingle();

  const toEmail = to ?? "";
  const { data: resolved } = await supa.rpc("resolve_campaign_for_inbound", {
    p_account: acc.id,
    p_to: toEmail,
  });

  const campaignId = existing.data?.campaign_id ?? resolved ?? null;

  const { data: tId } = await supa.rpc("find_or_create_thread", {
    p_provider: "gmail",
    p_provider_thread_id: threadId,
    p_account: acc.id,
    p_campaign: campaignId,
    p_lead: leadId,
  });

  const { data: mid } = await supa.rpc("upsert_inbound_message", {
    p_provider: "gmail",
    p_provider_message_id: msg.id,
    p_thread: tId,
    p_campaign: campaignId,
    p_lead: leadId,
    p_subject: subject ?? "",
    p_html: html ?? "",
    p_preview: preview ?? "",
    p_from_email: from ?? "",
    p_to_email: to ?? "",
    p_sent_at: sentAt,
  });

  // optional: bump cursor later
  return mid;
}

async function fetchHistory(token: string, startHistoryId?: string) {
  // If historyId present, use /history; else list recent (fallback)
  if (startHistoryId) {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?historyTypes=messageAdded&startHistoryId=${startHistoryId}`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || "history fetch failed");
    return j as any;
  } else {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=newer_than:7d`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || "list fetch failed");
    return { messages: j.messages ?? [], historyId: undefined };
  }
}

async function loadMessage(token: string, id: string) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || "message fetch failed");
  return j;
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account"); // optional single-account sync

  // 1) pick accounts
  const supa = sb();
  let q = supa
    .from("connected_accounts")
    .select("id, provider, email, access_token, refresh_token, expires_at, last_gmail_history_id")
    .eq("provider", "gmail");
  if (accountId) q = q.eq("id", accountId);
  const { data: accounts, error } = await q;
  if (error) return new Response(error.message, { status: 500 });

  let processed = 0;

  for (const acc of accounts ?? []) {
    try {
      const token = await ensureToken(acc);

      // Get history or recent
      const hist = await fetchHistory(token, acc.last_gmail_history_id ?? undefined);

      const msgIds: { id: string }[] = [];
      if (hist?.history) {
        for (const h of hist.history) {
          (h.messagesAdded ?? []).forEach((m: any) => msgIds.push({ id: m.message.id }));
        }
      } else if (hist?.messages) {
        msgIds.push(...hist.messages);
      }

      for (const m of msgIds) {
        const full = await loadMessage(token, m.id);
        const subject = headerValue(full.payload, "Subject");
        const threadId = full.threadId;
        await upsertInbound({ acc, token, msg: full, threadId, subject });
        processed++;
      }

      // Update cursor if present
      const latestHistId = hist?.historyId ?? null;
      await supa
        .from("connected_accounts")
        .update({
          last_gmail_history_id: latestHistId ?? acc.last_gmail_history_id,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", acc.id);
    } catch (_e) {
      // swallow to keep other accounts processing; consider logging to send_attempts or a separate table
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { "content-type": "application/json" },
  });
});

