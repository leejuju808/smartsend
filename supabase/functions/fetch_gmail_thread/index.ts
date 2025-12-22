// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const THREAD_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads/";
const TOKEN_URL  = "https://oauth2.googleapis.com/token";

type ThreadPayload = { user_id: string; threadId: string };

function b64urlToUtf8(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const str = atob(b64);
  const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)));
  return new TextDecoder().decode(bytes);
}

function walkParts(p: any): { text?: string; html?: string } {
  if (!p) return {};
  const stack = [p];
  let text = "", html = "";
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.parts) stack.push(...node.parts);
    const mime = node.mimeType;
    const data = node.body?.data;
    if (!data) continue;
    const content = b64urlToUtf8(data);
    if (mime === "text/plain") text += content + "\n";
    if (mime === "text/html")  html += content + "\n";
  }
  return { text: text.trim() || undefined, html: html.trim() || undefined };
}

function header(headers: any[], key: string) {
  return headers?.find((h) => h.name?.toLowerCase() === key.toLowerCase())?.value ?? null;
}
function extractEmail(addr: string | null) {
  if (!addr) return null;
  const m = addr.match(/<([^>]+)>/);
  return (m?.[1] ?? addr).trim();
}

Deno.serve(async (req) => {
  try {
    const supabase = (await import("jsr:@supabase/supabase-js")).createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { global: { fetch } }
    );
    const { user_id, threadId }: ThreadPayload = await req.json();

    // Load Gmail account
    const { data: ga } = await supabase.from("gmail_accounts").select("*").eq("user_id", user_id).single();
    if (!ga) return new Response(JSON.stringify({ error: "No Gmail connect" }), { status: 400 });

    // Refresh token if expired
    let accessToken = ga.access_token as string;
    const expired = new Date(ga.expiry) <= new Date();
    if (expired) {
      const tr = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
          client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
          grant_type: "refresh_token",
          refresh_token: ga.refresh_token
        })
      });
      if (!tr.ok) return new Response(JSON.stringify({ error: "Token refresh failed" }), { status: 400 });
      const tj = await tr.json();
      accessToken = tj.access_token;
      const newExp = new Date(Date.now() + (tj.expires_in ?? 3600) * 1000).toISOString();
      await supabase.from("gmail_accounts").update({ access_token: accessToken, expiry: newExp }).eq("id", ga.id);
    }

    // Fetch thread (full)
    const res = await fetch(`${THREAD_URL}${encodeURIComponent(threadId)}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ error: "Gmail thread fetch failed", detail: t }), { status: 400 });
    }
    const thread = await res.json();

    const messages = thread.messages ?? [];
    const rows = [];
    for (const m of messages) {
      const hs = m.payload?.headers ?? [];
      const subj = header(hs, "Subject") ?? "";
      const from = extractEmail(header(hs, "From"));
      const to = extractEmail(header(hs, "To"));
      const msgId = header(hs, "Message-Id");
      const inReplyTo = header(hs, "In-Reply-To");
      const refs = header(hs, "References");
      const internalDate = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString();
      const { text, html } = walkParts(m.payload);

      rows.push({
        user_id,
        gmail_thread_id: m.threadId,
        gmail_message_id: m.id,
        from_email: from ?? "unknown",
        to_email: to ?? null,
        subject: subj,
        body_text: text ?? null,
        body_html: html ?? null,
        message_id: msgId,
        in_reply_to: inReplyTo,
        references_ids: refs,
        internal_ts: internalDate
      });
    }

    // Upsert cache
    if (rows.length) {
      await supabase.from("reply_messages").upsert(rows, { onConflict: "user_id,gmail_message_id" });
    }

    return new Response(JSON.stringify({ ok: true, count: rows.length, messages: rows }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

