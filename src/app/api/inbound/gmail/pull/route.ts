import { NextRequest, NextResponse } from "next/server";
import { getFreshGmailToken } from "@/lib/getFreshGmailToken";

// Minimal Gmail helpers
async function gmailListMessages(accessToken: string, q: string, pageToken?: string) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", q);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const r = await fetch(url.toString(), { 
    headers: { Authorization: `Bearer ${accessToken}` }, 
    cache: "no-store" 
  });
  if (!r.ok) throw new Error(`Gmail list: ${r.statusText}`);
  return r.json() as Promise<{ messages?: { id: string, threadId: string }[], nextPageToken?: string }>;
}

async function gmailGetMessage(accessToken: string, id: string) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const r = await fetch(url, { 
    headers: { Authorization: `Bearer ${accessToken}` }, 
    cache: "no-store" 
  });
  if (!r.ok) throw new Error(`Gmail get: ${r.statusText}`);
  return r.json();
}

function header(h: any[], name: string) {
  return h?.find((x: any) => x.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBody(payload: any): string {
  // prefer text/plain part
  const parts = (payload.parts || []);
  const plain = parts.find((p: any) => p.mimeType === "text/plain")?.body?.data;
  const top = payload.body?.data;
  const b64 = plain || top;
  if (!b64) return "";
  const str = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return str;
}

export async function GET(req: NextRequest) {
  // Simple shared secret so only your cron can call this
  const auth = req.nextUrl.searchParams.get("key");
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // fetch gmail connection(s). For MVP, assume single-owner app:
  const { SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL } = process.env;
  if (!SUPABASE_SERVICE_ROLE_KEY || !NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: "missing env" }, { status: 500 });
  }

  // 1) get fresh gmail token (auto-refreshes if needed)
  let accessToken: string;
  let connUserId: string;
  try {
    accessToken = await getFreshGmailToken();
    // Get user_id for updating last_sync_at
    const connResp = await fetch(`${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/gmail_connections?select=user_id&limit=1`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: "no-store",
    });
    const [conn] = await connResp.json();
    if (!conn) return NextResponse.json({ message: "no gmail connection found" });
    connUserId = conn.user_id;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to get gmail token" }, { status: 500 });
  }
  // 2) list recent messages (last day) that look like replies
  // heuristics: has:inbox newer_than:1d -from:me
  let nextPage: string | undefined;
  const inserted: string[] = [];
  const q = "has:inbox newer_than:2d -from:me";

  do {
    const list = await gmailListMessages(accessToken, q, nextPage);
    const messages = list.messages || [];
    nextPage = list.nextPageToken;

    for (const m of messages) {
      // check if already stored
      const existsResp = await fetch(
        `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/email_messages?provider_message_id=eq.${m.id}&select=id`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          cache: "no-store",
        }
      );
      const exists = await existsResp.json();
      if (exists?.length) continue;

      const full = await gmailGetMessage(accessToken, m.id);

      const h = full.payload?.headers || [];
      const msgId = header(h, "Message-Id");
      const inReplyTo = header(h, "In-Reply-To");
      const refs = header(h, "References");
      const subject = header(h, "Subject");
      const from = header(h, "From");
      const to = header(h, "To");
      const dateStr = header(h, "Date");
      const bodyPlain = decodeBody(full.payload);

      // try to find lead via In-Reply-To -> sent_messages.provider_message_id
      let leadId: string | null = null;
      if (inReplyTo) {
        // Extract Message-Id from In-Reply-To header (may be wrapped in < >)
        const inReplyToMsgId = inReplyTo.trim().replace(/^</, "").replace(/>$/, "");
        const sentResp = await fetch(
          `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sent_messages?select=lead_id&provider_message_id=not.is.null&provider_message_id=eq.${encodeURIComponent(inReplyToMsgId)}`,
          { 
            headers: { 
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` 
            }, 
            cache: "no-store" 
          }
        );
        const sentRows = await sentResp.json();
        if (sentRows?.[0]?.lead_id) leadId = sentRows[0].lead_id;
      }

      // fallback: parse email addr from "From" and match leads.email
      if (!leadId && from) {
        const emailMatch = from.match(/<([^>]+)>/) || from.match(/([^\s@]+@[^\s@]+)/);
        const emailAddr = emailMatch?.[1] || emailMatch?.[0];
        if (emailAddr) {
          const leadResp = await fetch(
            `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/leads?select=id,email&email=eq.${encodeURIComponent(emailAddr.toLowerCase())}&limit=1`,
            { 
              headers: { 
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` 
              }, 
              cache: "no-store" 
            }
          );
          const leadRows = await leadResp.json();
          if (leadRows?.[0]?.id) leadId = leadRows[0].id;
        }
      }

      // store message
      const insertPayload = [{
        thread_id: full.threadId,
        provider_message_id: m.id,
        in_reply_to: inReplyTo || null,
        references_header: refs || null,
        subject,
        from_email: from || null,
        to_email: to || null,
        sent_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
        body_plain: bodyPlain,
        is_inbound: true,
        lead_id: leadId,
      }];

      const insResp = await fetch(`${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/email_messages`, {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(insertPayload),
      });

      if (!insResp.ok) {
        const err = await insResp.text();
        console.error("Insert email_messages failed:", err);
        continue;
      }

      inserted.push(m.id);

      // trigger AI reply detection if we have a lead
      if (leadId) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-detection`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ emailText: bodyPlain, leadId }),
          cache: "no-store",
        }).catch(() => {});
      }
    }
  } while (nextPage);

  // update last_sync_at
  await fetch(
    `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/gmail_connections?user_id=eq.${connUserId}`,
    {
      method: "PATCH",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ last_sync_at: new Date().toISOString() }),
    }
  );

  return NextResponse.json({ inserted });
}

