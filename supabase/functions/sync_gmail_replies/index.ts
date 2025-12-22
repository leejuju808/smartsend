// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LIST_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GET_URL  = "https://gmail.googleapis.com/gmail/v1/users/me/messages/";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type SyncPayload = {
  user_id: string;
  query?: string; // optional override
  days?: number;  // default 7
};

function parseHeader(hs: Array<{name:string,value:string}>, key: string) {
  return hs.find(h => h.name.toLowerCase() === key.toLowerCase())?.value ?? null;
}

function extractEmail(addr: string | null): string | null {
  if (!addr) return null;
  const m = addr.match(/<([^>]+)>/);
  return (m?.[1] ?? addr).trim();
}

Deno.serve(async (req) => {
  try {
    const supabase = (await import("jsr:@supabase/supabase-js@2")).createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { fetch } }
    );

    const { user_id, query, days }: SyncPayload = await req.json();

    // 1) Load Gmail account
    const { data: ga, error: gaErr } = await supabase
      .from("gmail_accounts")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (gaErr || !ga) {
      return new Response(JSON.stringify({ error: "No Gmail account connected." }), { status: 400 });
    }

    // 2) Refresh token if expired
    let accessToken = ga.access_token as string;
    const expired = new Date(ga.expiry) <= new Date();
    if (expired) {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
          client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
          grant_type: "refresh_token",
          refresh_token: ga.refresh_token
        })
      });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: "Token refresh failed" }), { status: 400 });
      }
      const t = await res.json();
      accessToken = t.access_token;
      const newExpiry = new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString();
      await supabase.from("gmail_accounts").update({ access_token: accessToken, expiry: newExpiry }).eq("id", ga.id);
    }

    // 3) Build Gmail search query (default: last 7d, only INBOX, non-spam/trash)
    const sinceDays = Math.max(1, Math.min(30, days ?? 7));
    const q = query ?? `in:inbox newer_than:${sinceDays}d -in:chats -category:promotions -category:social`;

    // 4) List message ids
    const listParams = new URLSearchParams({ q, maxResults: "100" });
    const listRes = await fetch(`${LIST_URL}?${listParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listed = await listRes.json();

    const ids: string[] = listed?.messages?.map((m: any) => m.id) ?? [];
    if (ids.length === 0) return new Response(JSON.stringify({ ok: true, inserted: 0, updated: 0 }));

    // 5) Fetch metadata for each message
    let inserted = 0, updated = 0;
    for (const id of ids) {
      const getParams = new URLSearchParams({
        format: "metadata",
        metadataHeaders: ["From","Subject","Message-Id","In-Reply-To","References"].join("&metadataHeaders="),
      });
      const g = await fetch(`${GET_URL}${id}?${getParams}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!g.ok) continue;
      const msg = await g.json();
      const headers = msg.payload?.headers ?? [];
      const from  = extractEmail(parseHeader(headers, "From"));
      const subj  = parseHeader(headers, "Subject") ?? "";
      const msgId = parseHeader(headers, "Message-Id");
      const inReplyTo = parseHeader(headers, "In-Reply-To");
      const refs = parseHeader(headers, "References");
      const snippet = msg.snippet ?? "";
      const threadId = msg.threadId as string | undefined;
      const internalDate = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString();

      // Basic heuristic: only store messages that look like leads (not sent by the owner)
      // Optionally, you can also fetch the owner's email from gmail_accounts.email_address and skip if from == owner
      const owner = ga.email_address;
      if (from && owner && from.toLowerCase() === owner.toLowerCase()) {
        continue; // skip own messages
      }

      // Check if reply already exists
      const { data: existing } = await supabase
        .from("replies")
        .select("id")
        .eq("user_id", user_id)
        .eq("gmail_message_id", msg.id)
        .maybeSingle();

      // Prepare row data
      const baseRow = {
        user_id: user_id,
        from_email: from ?? "unknown",
        subject: subj,
        snippet,
        body_text: null,
        gmail_thread_id: threadId ?? null,
        gmail_message_id: msg.id,
        message_id: msgId,
        references_ids: refs,
        in_reply_to: inReplyTo,
        internal_ts: internalDate
      };

      let result;
      if (existing) {
        // Update existing (preserve created_at)
        result = await supabase
          .from("replies")
          .update(baseRow)
          .eq("id", existing.id);
        if (!result.error) updated++;
      } else {
        // Insert new (set created_at)
        const insertRow = {
          ...baseRow,
          created_at: internalDate
        };
        result = await supabase
          .from("replies")
          .insert(insertRow);
        if (!result.error) inserted++;
      }

      if (result.error) {
        console.error("Upsert error:", result.error);
        continue;
      }
    }

    return new Response(JSON.stringify({ ok: true, inserted, updated, count: ids.length }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

