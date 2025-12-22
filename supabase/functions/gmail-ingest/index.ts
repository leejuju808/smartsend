// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

async function sb(path: string, init: RequestInit = {}) {
  const headers = {
    apikey: SB_SERVICE,
    Authorization: `Bearer ${SB_SERVICE}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`[Supabase] ${res.status} ${await res.text()}`);
  return res;
}

async function refreshToken(refresh_token: string) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`[Google OAuth] ${res.status} ${await res.text()}`);
  return res.json(); // { access_token, expires_in, ... }
}

function isExpired(iso: string | null | undefined): boolean {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now() + 60_000; // refresh 1 min early
}

async function listMessages(access_token: string, query: string, pageToken?: string) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`[Gmail list] ${res.status} ${await res.text()}`);
  return res.json(); // { messages: [{id, threadId}], nextPageToken }
}

async function getMessage(access_token: string, id: string) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
  url.searchParams.set("format", "full");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`[Gmail get] ${res.status} ${await res.text()}`);
  return res.json();
}

function header(hdrs: any[], name: string): string {
  return hdrs?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function base64UrlDecode(data: string): string {
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b64);
  } catch {
    return "";
  }
}

function decodeBody(msg: any): { text: string; html: string | null } {
  const payload = msg.payload || {};
  const parts = payload.parts || [];
  let bodyText = "";
  let bodyHtml: string | null = null;

  const getBody = (p: any) => (p.body?.data ? base64UrlDecode(p.body.data) : "");

  if (parts.length) {
    for (const p of parts) {
      const mime = p.mimeType || "";
      if (mime.includes("text/plain")) bodyText += getBody(p);
      if (mime.includes("text/html")) bodyHtml = (bodyHtml || "") + getBody(p);
    }
  } else {
    bodyText = getBody(payload);
  }

  return { text: bodyText, html: bodyHtml };
}

function parseEmail(emailHeader: string): string {
  const match = emailHeader.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return emailHeader.trim().toLowerCase();
}

// Heuristic classification: OOO/Bounce detection
function classifyMessage(
  subject: string,
  bodyText: string,
  fromEmail: string,
  headers: any[]
): { isOoo: boolean; isBounce: boolean; isActionable: boolean } {
  const text = `${subject} ${bodyText}`.toLowerCase();

  // Bounce detection
  const isMailerDaemon = /mailer-daemon|postmaster|noreply/i.test(fromEmail) ||
    /delivery status notification|undeliverable|delivery failure|returned mail/i.test(text);
  const bouncePatterns = [
    /user unknown|no such user|recipient address rejected|mailbox unavailable|550.*5\.1\.1|domain not found/i,
    /mailbox full|quota exceeded|temporarily deferred|try again later|4\d\d.*5\.\d\.\d|greylist/i,
  ];
  const isBounce = isMailerDaemon || bouncePatterns.some(r => r.test(text));

  // OOO detection
  const oooPatterns = [
    /out of office|automatic reply|vacation until|away until|auto-reply|autoreply/i,
    /^re:\s*(out of office|vacation|away)/i,
  ];
  const autoReplyHeader = headers.find((h: any) => 
    h.name?.toLowerCase() === "auto-submitted" && h.value?.toLowerCase() === "auto-replied"
  );
  const isOoo = oooPatterns.some(r => r.test(text)) || !!autoReplyHeader;

  const isActionable = !isBounce && !isOoo;

  return { isOoo, isBounce, isActionable };
}

// Find or create thread
async function findOrCreateThread(
  orgId: string | null,
  userId: string,
  gmailThreadId: string | null,
  fromEmail: string,
  subject: string,
  sentAt: string
): Promise<string | null> {
  // First try by gmail_thread_id
  if (gmailThreadId) {
    const { data: existing } = await sb(
      `threads?select=id&gmail_thread_id=eq.${encodeURIComponent(gmailThreadId)}&limit=1`
    ).then(r => r.json());
    if (existing && existing.length > 0) {
      return existing[0].id;
    }
  }

  // Fallback: find by lead email + subject within recent window (last 30 days)
  // First find lead by email
  const { data: lead } = await sb(
    `leads?select=id&email=ilike.${encodeURIComponent(fromEmail)}&user_id=eq.${userId}&limit=1`
  ).then(r => r.json());

  const leadId = lead && lead.length > 0 ? lead[0].id : null;
  if (!leadId) return null; // Skip if no matching lead

  // Find thread by lead_id + subject
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await sb(
    `threads?select=id&lead_id=eq.${leadId}&subject=eq.${encodeURIComponent(subject)}&last_message_at=gte.${thirtyDaysAgo}&limit=1`
  ).then(r => r.json());
  
  if (recent && recent.length > 0) {
    return recent[0].id;
  }

  const { data: newThread } = await sb("threads", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      lead_id: leadId,
      subject,
      gmail_thread_id: gmailThreadId,
      last_message_at: sentAt,
    }),
  }).then(r => r.json());

  return newThread?.id || null;
}

async function upsertThreadAndMessage(
  orgId: string | null,
  userId: string,
  email: string,
  gmailThreadId: string | null,
  fromEmail: string,
  toEmail: string,
  subject: string,
  bodyText: string,
  bodyHtml: string | null,
  headers: Record<string, string>,
  gmailMessageId: string,
  sentAt: string
) {
  // Check if message already exists (de-dup by external_id)
  const { data: existing } = await sb(
    `messages?select=id&external_id=eq.${encodeURIComponent(gmailMessageId)}&limit=1`
  ).then(r => r.json());

  if (existing && existing.length > 0) {
    return; // Skip duplicate
  }

  // Classify message
  const classification = classifyMessage(subject, bodyText, fromEmail, Object.entries(headers).map(([k, v]) => ({ name: k, value: v })));

  // Find or create thread
  const threadId = await findOrCreateThread(orgId, userId, gmailThreadId, fromEmail, subject, sentAt);
  if (!threadId) {
    console.warn(`No thread found/created for ${fromEmail}, skipping message`);
    return;
  }

  // Insert message
  await sb("messages", {
    method: "POST",
    body: JSON.stringify({
      thread_id: threadId,
      direction: "in", // inbound
      from_email: fromEmail,
      to_email: toEmail,
      subject,
      body_text: bodyText,
      body_html: bodyHtml,
      external_id: gmailMessageId,
      is_out_of_office: classification.isOoo,
      is_bounce: classification.isBounce,
      is_actionable: classification.isActionable,
      external_headers: headers,
      created_at: sentAt,
    }),
  });

  // Update thread status and timestamp if actionable
  if (classification.isActionable) {
    await sb(`threads?id=eq.${threadId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "open",
        last_message_at: sentAt,
      }),
    });
  }
}

async function ingestForMailbox(mb: any): Promise<number> {
  let access_token = mb.gmail_access_token || mb.access_token;
  const refresh_token = mb.gmail_refresh_token || mb.refresh_token;
  const expires_at = mb.gmail_token_expiry || mb.expires_at;
  const email = mb.from_email || mb.email;
  const orgId = mb.org_id || null;
  
  // Get user_id from profiles if needed
  let userId = mb.user_id;
  if (!userId && mb.owner) {
    const { data: profile } = await sb(`profiles?select=id&id=eq.${mb.owner}&limit=1`).then(r => r.json());
    userId = profile && profile.length > 0 ? profile[0].id : mb.owner;
  }
  if (!userId) {
    console.warn(`No user_id found for mailbox ${email}`);
    return 0;
  }

  // Refresh token if needed
  if (!access_token || isExpired(expires_at)) {
    if (!refresh_token) {
      console.warn(`No refresh_token for mailbox ${email}`);
      return 0;
    }
    try {
      const ref = await refreshToken(refresh_token);
      access_token = ref.access_token;
      const newExpiry = new Date(Date.now() + (ref.expires_in ?? 3600) * 1000).toISOString();
      
      // Update token in DB
      await sb(`mailboxes?owner=eq.${mb.owner || userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          gmail_access_token: access_token,
          gmail_token_expiry: newExpiry,
        }),
      });
    } catch (e) {
      console.error(`Failed to refresh token for ${email}:`, e);
      return 0;
    }
  }

  // Fetch recent messages (last day)
  const query = "newer_than:1d to:me -in:sent -in:drafts";
  let pageToken: string | undefined = undefined;
  let processed = 0;

  do {
    const { messages = [], nextPageToken } = await listMessages(access_token, query, pageToken);
    pageToken = nextPageToken;

    for (const msg of messages) {
      const full = await getMessage(access_token, msg.id);
      const hdrs = full.payload?.headers || [];

      const subject = header(hdrs, "Subject");
      const fromH = header(hdrs, "From");
      const toH = header(hdrs, "To");
      const dateH = header(hdrs, "Date");
      const sentAtIso = dateH ? new Date(dateH).toISOString() : new Date().toISOString();

      const from = parseEmail(fromH);
      const to = parseEmail(toH);

      const { text: bodyText, html: bodyHtml } = decodeBody(full);

      // Build headers object
      const headersObj: Record<string, string> = {};
      for (const h of hdrs) {
        if (h.name && h.value) {
          headersObj[h.name] = h.value;
        }
      }

      await upsertThreadAndMessage(
        orgId,
        userId,
        email,
        full.threadId || null,
        from,
        to,
        subject,
        bodyText,
        bodyHtml,
        headersObj,
        full.id,
        sentAtIso,
      );

      processed++;
      if (processed > 100) break; // safety cap per run
    }
  } while (pageToken && processed <= 100);

  return processed;
}

serve(async (_req) => {
  try {
    // Find all orgs with Gmail mailboxes
    // Try different mailbox table structures
    let mboxes: any[] = [];
    
    // Try mailboxes table (current structure)
    try {
      const res = await sb("mailboxes?select=id,owner,provider,from_email,gmail_refresh_token,gmail_access_token,gmail_token_expiry&provider=eq.gmail");
      mboxes = await res.json();
      
      // If empty, try email_accounts table
      if (!mboxes || mboxes.length === 0) {
        const res2 = await sb("email_accounts?select=id,user_id,provider,email_address as email,refresh_token,access_token,expires_at&provider=eq.gmail");
        mboxes = await res2.json();
      }
    } catch (e) {
      console.error("Error fetching mailboxes:", e);
    }

    let total = 0;
    for (const mb of mboxes || []) {
      try {
        total += await ingestForMailbox(mb);
      } catch (e) {
        console.error(`Error ingesting for mailbox ${mb.from_email || mb.email}:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: total }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

