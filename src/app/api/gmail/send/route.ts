import { NextRequest } from "next/server";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { stripHtml } from "@/lib/template";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-only
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

type SendPayload = {
  threadId?: string | null;       // internal thread_id (uuid) if you use one
  gmailThreadId?: string | null;  // Gmail threadId for threading
  leadId?: string | null;
  campaignId?: string | null;
  to: string;                     // "Name <email@acme.com>" or "email@acme.com"
  subject: string;
  bodyText?: string;              // optional if htmlBody provided
  htmlBody?: string;              // new
  replyTo?: string | null;
};

function supabaseAdmin() {
  return createClient(SB_URL, SB_SERVICE);
}

function isExpired(iso: string | null) {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now() + 60_000; // refresh 1 min early
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
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

function buildMime(fromEmail: string, to: string, subject: string, text: string, html: string, replyTo?: string | null) {
  const boundary = "bnd_SMARTSEND_" + Math.random().toString(36).slice(2);
  const headers = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];
  const parts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
    `--${boundary}--`,
    ""
  ];
  const rfc822 = headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  return Buffer.from(rfc822).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function POST(req: NextRequest) {
  try {
    // In a real app, derive current user/org from your auth (cookies/headers/JWT).
    // For MVP, accept ?email= param for which gmail_account to use.
    const url = new URL(req.url);
    const senderEmail = url.searchParams.get("email"); // the connected Gmail address
    if (!senderEmail) return new Response("Missing ?email=", { status: 400 });

    const payload = (await req.json()) as SendPayload;
    if (!payload.to || !payload.subject) {
      return new Response("Missing to/subject", { status: 400 });
    }

    const text = payload.bodyText ?? stripHtml(payload.htmlBody || "");
    const html = payload.htmlBody ?? (payload.bodyText ? `<p>${payload.bodyText.replace(/\n/g, "<br/>")}</p>` : "");

    if (!text && !html) return new Response("Missing body", { status: 400 });

    const sb = supabaseAdmin();
    
    // Try email_accounts first (check both email and email_address columns)
    let { data: accounts, error: accErr } = await sb
      .from("email_accounts")
      .select("*")
      .eq("email_address", senderEmail)
      .limit(1);

    // If not found, try with 'email' column
    if ((!accounts || accounts.length === 0) && !accErr) {
      ({ data: accounts, error: accErr } = await sb
        .from("email_accounts")
        .select("*")
        .eq("email", senderEmail)
        .limit(1));
    }

    // Fallback to integrations_gmail if email_accounts doesn't have it
    if ((!accounts || accounts.length === 0) && !accErr) {
      ({ data: accounts, error: accErr } = await sb
        .from("integrations_gmail")
        .select("*")
        .eq("email", senderEmail)
        .limit(1));
      
      // Transform integrations_gmail to match expected shape
      if (accounts && accounts.length > 0) {
        accounts = [{
          ...accounts[0],
          email_address: accounts[0].email,
          token_expires_at: accounts[0].expiry_date,
        }];
      }
    }

    if (accErr) throw accErr;
    const acc = accounts?.[0];
    if (!acc) return new Response("No connected Gmail account", { status: 404 });

    let accessToken: string = acc.access_token;
    const tokenExpiry = acc.token_expires_at || acc.expires_at || acc.expiry_date;
    
    if (!accessToken || isExpired(tokenExpiry)) {
      if (!acc.refresh_token) {
        return new Response("No refresh token available", { status: 401 });
      }
      const ref = await refreshToken(acc.refresh_token);
      accessToken = ref.access_token;
      const newExpiry = new Date(Date.now() + (ref.expires_in ?? 3600) * 1000).toISOString();
      
      // Update the correct table (handle both email and email_address columns)
      if (acc.email_address || acc.email) {
        const updateData: any = { access_token: accessToken };
        if (acc.token_expires_at !== undefined) {
          updateData.token_expires_at = newExpiry;
        } else if (acc.expires_at !== undefined) {
          updateData.expires_at = newExpiry;
        }
        // Update by whichever column exists
        const filter = acc.email_address 
          ? sb.from("email_accounts").update(updateData).eq("email_address", senderEmail)
          : sb.from("email_accounts").update(updateData).eq("email", senderEmail);
        const { error: upErr } = await filter;
        if (upErr) throw upErr;
      } else {
        const { error: upErr } = await sb
          .from("integrations_gmail")
          .update({ access_token: accessToken, expiry_date: newExpiry })
          .eq("email", senderEmail);
        if (upErr) throw upErr;
      }
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const raw = buildMime(
      senderEmail,
      payload.to,
      payload.subject,
      text,
      html,
      payload.replyTo ?? null
    );

    // Send
    const sendRes = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        threadId: payload.gmailThreadId ?? undefined,
      },
    });

    const messageId = sendRes.data.id!;
    const threadId = sendRes.data.threadId ?? payload.gmailThreadId ?? null;

    // Insert outbound into emails table
    const sentAt = new Date().toISOString();
    const toList = [payload.to]; // you can parse/expand to multiple recipients
    const { error: insertErr } = await sb.from("emails").insert({
      gmail_message_id: messageId,
      gmail_thread_id: threadId,
      thread_id: payload.threadId ?? null,
      lead_id: payload.leadId ?? null,
      campaign_id: payload.campaignId ?? null,
      is_incoming: false,
      sender: senderEmail,
      subject: payload.subject,
      body: text,
      body_text: text,
      html_body: html,
      provider: "gmail",
      sent_at: sentAt,
      to_recipients: toList,
      received_at: sentAt,       // optional: mirror for unified sorting
      reply_to: payload.replyTo ?? null,
      raw_headers: null
    });
    if (insertErr) throw insertErr;

    // Log event
    await sb.from("campaign_logs").insert({
      campaign_id: payload.campaignId ?? null,
      lead_id: payload.leadId ?? null,
      email_id: null, // could backfill by selecting the row above if needed
      event: "sent",
      payload: { to: toList, provider: "gmail", gmail_message_id: messageId }
    });

    return new Response(JSON.stringify({ ok: true, gmail_message_id: messageId, gmail_thread_id: threadId }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    console.error("Gmail send error:", e);
    return new Response(`Send error: ${e?.message || String(e)}`, { status: 500 });
  }
}
