// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const PUBSUB_TOKEN = Deno.env.get("PUBSUB_SHARED_TOKEN")!;

// --- Google helpers

async function refreshAccessToken(refresh_token: string) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("token refresh failed: " + (await r.text()));
  return await r.json(); // { access_token, expires_in, token_type, scope }
}

async function gmailGetMessage(access_token: string, id: string) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!r.ok) throw new Error("gmail message fetch failed: " + (await r.text()));
  return await r.json();
}

// Parse delivery-status DSN and common bounce patterns
function parseBounce(msg: any) {
  const headers: Record<string,string> = {};
  for (const h of msg.payload?.headers ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  // Quick heuristics
  const subject = headers["subject"] || "";
  const from = headers["from"] || "";
  const contentType = headers["content-type"] || "";

  const isDSN = contentType.toLowerCase().includes("multipart/report") || subject.includes("Delivery Status Notification") || subject.includes("Undeliverable");
  const isMailerDaemon = /mailer-daemon|postmaster/i.test(from);

  if (!isDSN && !isMailerDaemon) return null;

  // Extract final recipient from parts (delivery-status)
  let finalRecipient = "";
  let action = "";
  let statusCode = "";
  let originalMessageId = "";

  const stack = [msg.payload];
  while (stack.length) {
    const p = stack.pop();
    if (!p) continue;
    if (p.parts) stack.push(...p.parts);
    if (p.mimeType === "message/delivery-status" && p.body?.data) {
      const txt = atobUrlSafe(p.body.data);
      // Parse RFC3464-ish lines
      for (const line of txt.split(/\r?\n/)) {
        const m1 = line.match(/^Final-Recipient:\s*(?:rfc822;)?\s*(.+)$/i);
        if (m1) finalRecipient = m1[1].trim();

        const m2 = line.match(/^Action:\s*(.+)$/i);
        if (m2) action = m2[1].trim().toLowerCase();

        const m3 = line.match(/^Status:\s*([0-9.]+)/i);
        if (m3) statusCode = m3[1].trim();

        const m4 = line.match(/^Original-Message-ID:\s*<([^>]+)>/i);
        if (m4) originalMessageId = m4[1].trim();
      }
    }
    // Some MTAs place the original as message/rfc822
    if (p.mimeType === "message/rfc822" && p.body?.data) {
      const inner = atobUrlSafe(p.body.data);
      const m = inner.match(/Message-Id:\s*<([^>]+)>/i);
      if (m && !originalMessageId) originalMessageId = m[1].trim();
    }
  }

  // Fallbacks via headers commonly present
  if (!finalRecipient) finalRecipient = headers["x-failed-recipients"] || "";
  if (!originalMessageId) originalMessageId = headers["references"] || headers["in-reply-to"] || "";

  const confirmedBounce = action.includes("failed") || subject.includes("Undeliverable") || isMailerDaemon;
  if (!confirmedBounce) return null;

  return {
    finalRecipient: (finalRecipient || "").replace(/[<>]/g, "").toLowerCase(),
    originalMessageId: (originalMessageId || "").trim(),
    statusCode,
    rawSubject: subject
  };
}

function atobUrlSafe(data: string) {
  data = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = 4 - (data.length % 4 || 4);
  if (pad) data += "=".repeat(pad);
  return atob(data);
}

// Find send_log by provider_message_id OR by (to_email + recent subject match)
async function findSendLog({ originalMessageId, finalRecipient }: { originalMessageId?: string; finalRecipient?: string }) {
  if (originalMessageId) {
    // provider_message_id may contain <...>; store stripped in DB? Try both
    const candidates = [
      originalMessageId,
      `<${originalMessageId.replace(/[<>]/g, "")}>`,
      originalMessageId.replace(/[<>]/g, "")
    ];
    for (const pmid of candidates) {
      const { data } = await supabase
        .from("send_logs")
        .select("id, campaign_id, lead_id")
        .eq("provider_message_id", pmid)
        .maybeSingle();
      if (data?.id) return data;
    }
  }

  if (finalRecipient) {
    // fallback: most recent sent to that recipient (last 7d)
    const since = new Date(Date.now() - 7*864e5).toISOString();
    const { data } = await supabase
      .from("send_logs")
      .select("id, campaign_id, lead_id")
      .eq("to_email", finalRecipient.toLowerCase())
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (data && data[0]) return data[0];
  }

  return null;
}

async function insertBounce({ log, provider_message_id, meta }: any) {
  if (!log) return;
  // Insert a delivery_event bounce (idempotent via unique index on event_key you added earlier)
  await supabase.from("delivery_events").insert({
    log_id: log.id,
    campaign_id: log.campaign_id,
    lead_id: log.lead_id,
    kind: "bounce",
    provider: "gmail",
    provider_message_id,
    meta
  });
}

Deno.serve(async (req) => {
  try {
    // Verify Pub/Sub push token
    const token = req.headers.get("x-pubsub-token") || req.headers.get("X-Pubsub-Token");
    if (!PUBSUB_TOKEN || token !== PUBSUB_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Pub/Sub message envelope
    const body = await req.json().catch(() => ({}));
    const msg = body?.message || {};
    const dataB64 = msg?.data;
    if (!dataB64) return new Response(JSON.stringify({ ok: true, noData: true }), { status: 200 });

    const decoded = JSON.parse(atobUrlSafe(dataB64)); // { emailAddress, historyId }
    const emailAddress: string = decoded.emailAddress;

    // Find the connected account by email
    // Try multiple matching strategies since schema may vary
    let acct: any = null;

    // First, try matching by email_address or email column
    const { data: acctByEmail } = await supabase
      .from("connected_accounts")
      .select("id, gmail_tokens, smtp_settings, email_address, email")
      .eq("provider", "gmail")
      .or(`email_address.eq.${emailAddress},email.eq.${emailAddress}`)
      .maybeSingle();
    
    if (acctByEmail?.gmail_tokens?.refresh_token) {
      acct = acctByEmail;
    }

    // If not found, try matching via smtp_settings.user or smtp_settings.from
    if (!acct?.gmail_tokens?.refresh_token) {
      const { data: allAccounts } = await supabase
        .from("connected_accounts")
        .select("id, gmail_tokens, smtp_settings")
        .eq("provider", "gmail");
      
      if (allAccounts) {
        for (const acc of allAccounts) {
          const settings = acc.smtp_settings as any;
          if (settings?.user === emailAddress || settings?.from === emailAddress) {
            if (acc.gmail_tokens?.refresh_token) {
              acct = acc;
              break;
            }
          }
        }
      }
    }

    if (!acct?.gmail_tokens?.refresh_token) {
      // Can't proceed without tokens to read the Gmail message
      return new Response(JSON.stringify({ ok: true, skip: "no_tokens_for_mailbox" }), { status: 200 });
    }

    const { access_token } = await refreshAccessToken(acct.gmail_tokens.refresh_token);

    // Pub/Sub doesn't give the message id; we must read the latest messages and filter for DSNs quickly.
    // Pull last 5 messages from INBOX from the last few minutes
    const q = `newer_than:2d`; // safe catch-all; DSNs arrive immediately
    const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=5`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!list.ok) {
      return new Response(JSON.stringify({ ok:false, error: await list.text() }), { status: 500 });
    }
    const { messages } = await list.json();

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ ok:true, messages:0 }), { status: 200 });
    }

    // For each candidate, fetch and parse; insert bounce when matched
    for (const m of messages) {
      try {
        const full = await gmailGetMessage(access_token, m.id);
        const parsed = parseBounce(full);
        if (!parsed) continue;

        const log = await findSendLog({
          originalMessageId: parsed.originalMessageId,
          finalRecipient: parsed.finalRecipient
        });

        if (log) {
          await insertBounce({
            log,
            provider_message_id: parsed.originalMessageId || m.id,
            meta: {
              finalRecipient: parsed.finalRecipient,
              status: parsed.statusCode,
              subject: parsed.rawSubject,
              gmail_message_id: m.id
            }
          });
        }
      } catch (e) {
        console.error("bounce parse err", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: messages.length }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});

