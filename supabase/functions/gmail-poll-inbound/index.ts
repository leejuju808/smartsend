// Deno (Supabase Edge)
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
    refresh_token
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  if (!res.ok) throw new Error(`[Google OAuth] ${res.status} ${await res.text()}`);
  return res.json(); // { access_token, expires_in, ... }
}

function isExpired(iso: string) {
  return new Date(iso).getTime() <= Date.now() + 60_000; // refresh 1 min early
}

async function listMessages(access_token: string, query: string, pageToken?: string) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  if (!res.ok) throw new Error(`[Gmail list] ${res.status} ${await res.text()}`);
  return res.json(); // { messages: [{id, threadId}], nextPageToken }
}

async function getMessage(access_token: string, id: string) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
  url.searchParams.set("format", "full");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  if (!res.ok) throw new Error(`[Gmail get] ${res.status} ${await res.text()}`);
  return res.json();
}

function header(hdrs: any[], name: string) {
  return hdrs?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(msg: any): string {
  const part = msg.payload?.parts?.find((p: any) => p.mimeType === "text/plain") ?? msg.payload;
  const data = part?.body?.data;
  if (!data) return "";
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try { return atob(b64); } catch { return ""; }
}

function inferIncoming(from: string, myEmail: string) {
  return !from.toLowerCase().includes(myEmail.toLowerCase());
}

function parseEmail(fromHeader: string): string | null {
  // Parse "Name <email@domain.com>" → "email@domain.com"
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  // Fallback: if no <>, assume entire string is email
  const email = fromHeader.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

async function findLead(email: string, userId: string): Promise<{ lead_id: string | null; campaign_id: string | null }> {
  try {
    const parsed = parseEmail(email);
    if (!parsed) return { lead_id: null, campaign_id: null };
    
    const res = await sb(`leads?select=id,campaign_id&email=ilike.${encodeURIComponent(parsed)}&user_id=eq.${userId}&limit=1`);
    const leads = await res.json();
    if (leads && leads.length > 0) {
      return { lead_id: leads[0].id, campaign_id: leads[0].campaign_id || null };
    }
  } catch (e) {
    console.error("lead lookup error", e);
  }
  return { lead_id: null, campaign_id: null };
}

serve(async (_req) => {
  // 1) load all connected accounts
  const accRes = await sb("gmail_accounts?select=*");
  const accounts = await accRes.json();

  for (const acc of accounts) {
    try {
      // 2) refresh token if needed
      let access_token = acc.access_token as string;
      if (!access_token || isExpired(acc.token_expiry)) {
        const ref = await refreshToken(acc.refresh_token);
        access_token = ref.access_token;
        const newExpiry = new Date(Date.now() + (ref.expires_in ?? 3600) * 1000).toISOString();
        await sb(`gmail_accounts?email_address=eq.${encodeURIComponent(acc.email_address)}`, {
          method: "PATCH",
          body: JSON.stringify({ access_token, token_expiry: newExpiry })
        });
      }

      // 3) determine query window
      const since = acc.last_sync_at
        ? `after:${Math.floor(new Date(acc.last_sync_at).getTime() / 1000)}`
        : "newer_than:7d";
      // Skip our own messages
      const query = `${since} -from:${acc.email_address}`;

      // 4) page through new messages
      let pageToken: string | undefined = undefined;
      let newestTs = acc.last_sync_at ? new Date(acc.last_sync_at).getTime() : 0;

      do {
        const { messages = [], nextPageToken } = await listMessages(access_token, query, pageToken);
        pageToken = nextPageToken;

        for (const m of messages) {
          const full = await getMessage(access_token, m.id);
          const hdrs = full.payload?.headers ?? [];
          const subject = header(hdrs, "Subject");
          const from = header(hdrs, "From");
          const to = header(hdrs, "To");
          const dateStr = header(hdrs, "Date");
          const received_at = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
          const body = decodeBody(full);

          const is_incoming = inferIncoming(from, acc.email_address);

          // Optional: resolve lead_id and campaign_id from sender email
          const { lead_id, campaign_id } = is_incoming 
            ? await findLead(from, acc.user_id)
            : { lead_id: null, campaign_id: null };

          // Upsert email
          const emailRes = await sb("emails", {
            method: "POST",
            body: JSON.stringify({
              gmail_message_id: full.id,
              gmail_thread_id: full.threadId,
              thread_id: null,                // optional: map to internal thread if you have one
              lead_id,                        // resolved from leads table if match found
              campaign_id,                    // resolved from lead's campaign_id if available
              is_incoming,
              sender: from,
              subject,
              body_text: body,
              body_html: null,                // could parse HTML parts if needed
              user_id: acc.user_id,
              raw_headers: hdrs,
              received_at
            }),
            headers: { Prefer: "return=representation" }
          }).catch(async (e) => {
            // if dup (unique gmail_message_id), ignore
            const msg = String(e);
            if (!/duplicate key|already exists/i.test(msg)) throw e;
            return null;
          });

          // Trigger objection detector for inbound emails with lead_id
          if (emailRes && is_incoming && lead_id) {
            try {
              const emailData = await emailRes.json();
              const emailId = Array.isArray(emailData) ? emailData[0]?.id : emailData?.id;
              if (emailId) {
                // Fire-and-forget: trigger objection detector
                fetch(`${SB_URL}/functions/v1/ai-sdr-objection-detector`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SB_SERVICE}`,
                  },
                  body: JSON.stringify({ email_id: emailId }),
                }).catch((err) => {
                  console.error("Failed to trigger objection detector:", err);
                  // Don't throw - objection detection failure shouldn't break email ingestion
                });
              }
            } catch (err) {
              console.error("Error parsing email response:", err);
            }
          }

          // watermark
          const t = Date.parse(received_at);
          if (t > newestTs) newestTs = t;
        }
      } while (pageToken);

      // 5) advance account watermark
      if (newestTs > 0) {
        await sb(`gmail_accounts?email_address=eq.${encodeURIComponent(acc.email_address)}`, {
          method: "PATCH",
          body: JSON.stringify({ last_sync_at: new Date(newestTs).toISOString() })
        });
      }
    } catch (e) {
      // non-fatal per account
      await sb(`gmail_accounts?email_address=eq.${encodeURIComponent(acc.email_address)}`, {
        method: "PATCH",
        body: JSON.stringify({ last_sync_at: acc.last_sync_at ?? null }) // no change
      });
      console.error("gmail poll error for", acc.email_address, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, accounts: accounts.length }), {
    headers: { "Content-Type": "application/json" }
  });
});

