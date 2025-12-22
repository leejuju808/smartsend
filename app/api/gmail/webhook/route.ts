import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PubSubPush = {
  message?: {
    data?: string; // base64
    attributes?: Record<string, string>;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
};

type GmailWatchData = { emailAddress: string; historyId: string };

type EmailAccount = {
  id: string;
  user_id: string;
  email_address: string;
  provider: "gmail";
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
};

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // --- 1) Verify Pub/Sub shared secret ---
  const expected = process.env.PUBSUB_WEBHOOK_TOKEN || "";
  const provided =
    req.nextUrl.searchParams.get("token") ||
    req.headers.get("x-pubsub-token") ||
    "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // --- 2) Parse Pub/Sub envelope ---
  let body: PubSubPush;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const b64 = body?.message?.data;
  if (!b64) return NextResponse.json({ ok: true, note: "noop (no data)" });

  let watchData: GmailWatchData | null = null;
  try {
    watchData = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return NextResponse.json({ ok: true, note: "noop (bad data)" });
  }

  // --- 3) Look up the connected Gmail account by emailAddress ---
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: acctRow, error: acctErr } = await supabaseAdmin
    .from("email_accounts")
    .select("*")
    .eq("provider", "gmail")
    .eq("email_address", watchData.emailAddress)
    .maybeSingle();

  if (acctErr || !acctRow) {
    // Ack to avoid Pub/Sub retries; log for follow-up.
    await supabaseAdmin.from("logs").insert({
      level: "warn",
      source: "gmail-webhook",
      message: "No linked gmail account for emailAddress",
      meta: { emailAddress: watchData.emailAddress, acctErr },
    });
    return NextResponse.json({ ok: true, note: "no-linked-account" });
  }

  const acct = acctRow as EmailAccount;

  // --- 4) Ensure we have a valid access token (refresh if needed) ---
  const accessToken = await ensureAccessToken(acct, supabaseAdmin);

  // --- 5) Fetch the newest INBOX message ---
  const listUrl = new URL(`${GMAIL_API}/users/me/messages`);
  listUrl.searchParams.set("q", "in:inbox newer_than:2d");
  listUrl.searchParams.set("maxResults", "1");
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    await supabaseAdmin.from("logs").insert({
      level: "error",
      source: "gmail-webhook",
      message: "Failed to list messages",
      meta: { status: listRes.status, email: acct.email_address },
    });
    return NextResponse.json({ ok: true, note: "list-failed" });
  }

  const listJson = (await listRes.json()) as { messages?: { id: string }[] };
  const msgId = listJson.messages?.[0]?.id;
  if (!msgId) return NextResponse.json({ ok: true, note: "no-new-message" });

  // --- 6) Get full message to parse From + body ---
  const msgUrl = `${GMAIL_API}/users/me/messages/${msgId}?format=full`;
  const msgRes = await fetch(msgUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!msgRes.ok) {
    await supabaseAdmin.from("logs").insert({
      level: "error",
      source: "gmail-webhook",
      message: "Failed to get message",
      meta: { status: msgRes.status, msgId },
    });
    return NextResponse.json({ ok: true, note: "get-msg-failed" });
  }
  const msg = (await msgRes.json()) as any;

  const headers: Record<string, string> = {};
  for (const h of msg.payload?.headers || []) {
    headers[h.name.toLowerCase()] = h.value;
  }
  const fromHeader = headers["from"] || "";
  const subject = headers["subject"] || "";
  const senderEmail = extractEmail(fromHeader);
  const threadId = msg.threadId || "";

  const emailBody = extractMessageBody(msg);

  if (!senderEmail || !emailBody) {
    await supabaseAdmin.from("logs").insert({
      level: "warn",
      source: "gmail-webhook",
      message: "Missing sender or body",
      meta: { msgId, senderEmail, hasBody: !!emailBody },
    });
    return NextResponse.json({ ok: true, note: "missing-fields" });
  }

  // --- 6.5) Map thread/email to lead_id if possible ---
  let leadId: string | null = null;
  let campaignId: string | null = null;
  
  if (threadId) {
    const { data: log } = await supabaseAdmin
      .from("campaign_logs")
      .select("lead_id, campaign_id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (log) {
      leadId = log.lead_id;
      campaignId = log.campaign_id;
    }
  }
  
  // If no thread match, try to find by email
  if (!leadId) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, campaign_id")
      .eq("email", senderEmail.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (lead) {
      leadId = lead.id;
      campaignId = lead.campaign_id;
    }
  }

  // --- 7) Call the replyDetection edge function with AI ---
  if (leadId) {
    const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/replyDetection`;
    const fnRes = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        messageBody: emailBody,
        lead_id: leadId,
        campaign_id: campaignId
      }),
    });

    const fnJson = await fnRes.json().catch(() => ({}));
    if (!fnRes.ok) {
      await supabaseAdmin.from("logs").insert({
        level: "error",
        source: "gmail-webhook",
        message: "replyDetection failed",
        meta: { status: fnRes.status, fnJson },
      });
    }
  }

  // --- 8) Also call the existing detectReply edge function (for compatibility) ---
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/detectReply`;
  const fnRes = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ 
      email: senderEmail,
      subject: subject,
      body: emailBody,
      threadId: threadId
    }),
  });

  const fnJson = await fnRes.json().catch(() => ({}));
  if (!fnRes.ok) {
    await supabaseAdmin.from("logs").insert({
      level: "error",
      source: "gmail-webhook",
      message: "detectReply failed",
      meta: { status: fnRes.status, fnJson },
    });
  }

  // Ack success to Pub/Sub
  return NextResponse.json({ ok: true, processed: true, result: fnJson });
}

// ---------- helpers ----------

function extractEmail(fromHeader: string): string | null {
  const match = fromHeader.match(/<([^>]+)>/);
  const email = (match ? match[1] : fromHeader).trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function extractMessageBody(msg: any): string {
  const parts: any[] = flattenParts(msg.payload);

  const plain = parts.find((p) => p.mimeType === "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);

  const html = parts.find((p) => p.mimeType === "text/html");
  if (html?.body?.data) {
    const raw = decodeBase64Url(html.body.data);
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  if (msg.payload?.body?.data) return decodeBase64Url(msg.payload.body.data);
  return "";
}

function flattenParts(payload: any): any[] {
  const out: any[] = [];
  function walk(p: any) {
    if (!p) return;
    out.push(p);
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  }
  walk(payload);
  return out;
}

function decodeBase64Url(b64: string): string {
  const fixed = b64.replace(/-/g, "+").replace(/_/g, "/");
  const buf = Buffer.from(fixed, "base64");
  return buf.toString("utf8");
}

async function ensureAccessToken(
  acct: EmailAccount,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<string> {
  const now = Date.now();
  const exp = acct.token_expires_at ? Date.parse(acct.token_expires_at) : 0;
  if (exp && exp - now > 60_000) return acct.access_token;

  if (!acct.refresh_token) return acct.access_token;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: acct.refresh_token!,
    }),
  });

  if (!res.ok) return acct.access_token;
  const json = await res.json();
  const newAccess = json.access_token as string;
  const expiresIn = (json.expires_in as number) ?? 3600;

  await supabaseAdmin
    .from("email_accounts")
    .update({
      access_token: newAccess,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    })
    .eq("id", acct.id);

  return newAccess;
} 