// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

type ProviderAccount = {
  id: string;
  account_id: string;
  provider: string;
  email: string;
  tokens: {
    access_token?: string;
  } | null;
  poll: {
    cursor?: Record<string, unknown> | null;
  } | null;
};

Deno.serve(async () => {
  const { data: accts, error } = await sb
    .from("provider_accounts")
    .select("id,account_id,provider,email,tokens:provider_tokens(*), poll:provider_poll_state(*)")
    .eq("provider", "gmail");

  if (error) {
    console.error("Failed to load provider accounts", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let ingested = 0;

  for (const a of (accts ?? []) as ProviderAccount[]) {
    const access = a.tokens?.access_token;
    if (!access) continue;

    const q = "in:inbox newer_than:7d -from:me";
    const listRes = await fetch(
      `${GMAIL_BASE}/messages?maxResults=50&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${access}` } }
    );

    if (!listRes.ok) {
      console.error("gmail list failed", await listRes.text());
      continue;
    }

    const li = await listRes.json();

    for (const m of li.messages ?? []) {
      const fullRes = await fetch(
        `${GMAIL_BASE}/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${access}` } }
      );
      if (!fullRes.ok) continue;
      const msg = await fullRes.json();

      const headers = indexHeaders(msg.payload?.headers || []);
      const from = headers["fromEmail"];
      const to = headers["toEmail"];
      if (!from || !to) continue;

      const existing = await sb
        .from("inbound_messages")
        .select("id")
        .eq("provider", "gmail")
        .eq("provider_msg_id", msg.id)
        .maybeSingle();
      if (existing.data) continue;

      const { data: lead } = await sb
        .from("leads")
        .select("id")
        .eq("email", from)
        .maybeSingle();

      const { data: ident } = await sb
        .from("send_identities")
        .select("id")
        .eq("email", to)
        .maybeSingle();

      const inReply = headers["in-reply-to"];
      let sq: { id: number | null; campaign_id: string | null } | null = null;

      if (inReply) {
        const { data: sqrow } = await sb
          .from("send_queue")
          .select("id,campaign_id")
          .or(`id.eq.${inReply},thread_key.eq.${inReply}`)
          .limit(1)
          .maybeSingle();
        sq = sqrow ?? null;
      }

      const parts = extractBodies(msg);
      const payload = {
            provider: "gmail",
        provider_msg_id: msg.id as string,
        provider_thread_id: msg.threadId as string | null,
        account_id: a.account_id,
        identity_id: ident?.id ?? null,
        lead_id: lead?.id ?? null,
        from_email: from,
        to_email: to,
        subject: headers["subject"] || null,
        snippet: msg.snippet || null,
        text_body: parts.text,
        html_body: parts.html,
        headers,
        campaign_id: sq?.campaign_id ?? null,
        send_queue_id: sq?.id ?? null,
        in_reply_to: inReply || null,
        references_ids: headers["referencesArr"] || [],
        received_at: new Date(Number(msg.internalDate)).toISOString()
      };

      const insertRes = await sb.from("inbound_messages").insert(payload);
      if (insertRes.error) {
        console.error("Failed to insert inbound", insertRes.error);
        continue;
      }
      ingested++;
    }

    await sb.from("provider_poll_state").upsert({
      provider_account_id: a.id,
      provider: "gmail",
      cursor: {},
      updated_at: new Date().toISOString()
    });
  }

  return new Response(JSON.stringify({ ingested }), {
    headers: { "content-type": "application/json" }
  });
});

function indexHeaders(headers: any[]) {
  const h: Record<string, any> = {};
  for (const x of headers) {
    if (!x?.name) continue;
    h[x.name.toLowerCase()] = x.value;
  }

  const fromRaw = h["from"] || "";
  const toRaw = h["delivered-to"] || h["to"] || "";

  h["fromEmail"] = extractEmail(fromRaw);
  h["toEmail"] = extractEmail(toRaw);
  h["subject"] = h["subject"] || "";
  h["in-reply-to"] = h["in-reply-to"] || null;
  h["referencesArr"] = typeof h["references"] === "string"
    ? h["references"].split(/\s+/).filter(Boolean)
    : [];

  return h;
}

function extractEmail(value: string): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return value.trim().toLowerCase() || null;
}

function extractBodies(msg: any): { text: string | null; html: string | null } {
  const res = { text: null as string | null, html: null as string | null };
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/plain") res.text = decodeBody(p.body?.data);
    if (p.mimeType === "text/html") res.html = decodeBody(p.body?.data);
    (p.parts || []).forEach(walk);
  };
  walk(msg.payload);
  return res;
}

function decodeBody(data?: string): string | null {
  if (!data) return null;
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - (normalized.length % 4)) % 4, "=");
  try {
    const decoded = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(decoded, (c) => c.charCodeAt(0)));
  } catch (_err) {
    return null;
  }
}