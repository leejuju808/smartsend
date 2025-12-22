import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
export const runtime = "nodejs";

type EmailAccount = {
  id: string;
  user_id: string;
  email_address: string;
  provider: "gmail";
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
};

/**
 * POST /api/gmail/watch
 * Body: { email: string }
 * Pre-req: a row exists in public.email_accounts for this email with valid tokens.
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (!email) {
    return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: acct, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("provider", "gmail")
    .eq("email_address", email.toLowerCase())
    .maybeSingle();

  if (error || !acct) {
    return NextResponse.json({ ok: false, error: "no linked gmail account" }, { status: 404 });
  }

  const accessToken = await ensureAccessToken(acct, supabase);

  // Build watch request:
  // - topicName: your GCP Pub/Sub topic that pushes to /api/gmail/webhook
  // - labelIds: INBOX only (MVP)
  // - labelFilterAction: include (default)
  const topicName = process.env.GMAIL_PUBSUB_TOPIC!;
  if (!topicName) {
    return NextResponse.json({ ok: false, error: "GMAIL_PUBSUB_TOPIC not set" }, { status: 500 });
  }

  const res = await fetch(`${GMAIL_API}/users/me/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName,
      labelIds: ["INBOX"],
      // OPTIONAL: filter for unread only: "q": "in:inbox is:unread"
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    await supabase.from("logs").insert({
      level: "error",
      source: "gmail-watch",
      message: "Failed to start Gmail watch",
      meta: { status: res.status, json, email },
    });
    return NextResponse.json({ ok: false, error: "watch failed", json }, { status: 500 });
  }

  // json returns { historyId, expiration }
  // (Optional) persist last watch info to email_accounts
  await supabase
    .from("email_accounts")
    .update({
      // add columns if you created them; if not, skip
      // last_gmail_history_id: json.historyId,
      // watch_expires_at: new Date(Number(json.expiration)).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", acct.id);

  return NextResponse.json({ ok: true, watch: json });
}

// ------- helpers --------
async function ensureAccessToken(
  acct: EmailAccount,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const expMs = acct.token_expires_at ? Date.parse(acct.token_expires_at) : 0;
  if (expMs && expMs - Date.now() > 60_000) return acct.access_token;

  if (!acct.refresh_token) return acct.access_token;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: acct.refresh_token!,
    }),
  });
  if (!resp.ok) return acct.access_token;
  const json = await resp.json();
  const newAccess = json.access_token as string;
  const expiresIn = (json.expires_in as number) ?? 3600;

  await supabase
    .from("email_accounts")
    .update({
      access_token: newAccess,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    })
    .eq("id", acct.id);

  return newAccess;
}