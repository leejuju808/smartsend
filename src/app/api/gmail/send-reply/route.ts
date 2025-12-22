import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function base64UrlEncode(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { threadId, to, subject, body, inReplyToMessageId } = await req.json();

  // 1) get tokens
  const { data: acct, error } = await supabase
    .from("email_accounts")
    .select("email_address, access_token, refresh_token, token_expires_at")
    .eq("user_id", user.id)
    .eq("provider", "gmail")
    .maybeSingle();
  if (error || !acct) return NextResponse.json({ error: "No Gmail account" }, { status: 400 });

  // 2) refresh if expiring
  let accessToken = acct.access_token as string | null;
  const needsRefresh = !accessToken || !acct.token_expires_at || new Date(acct.token_expires_at) < new Date(Date.now() + 60_000);
  if (needsRefresh) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: acct.refresh_token as string,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return NextResponse.json({ error: "Token refresh failed" }, { status: 500 });
    const json = await res.json();
    accessToken = json.access_token;
    const expiryIso = new Date(Date.now() + json.expires_in * 1000).toISOString();
    await supabase
      .from("email_accounts")
      .update({ access_token: accessToken, token_expires_at: expiryIso })
      .eq("user_id", user.id)
      .eq("provider", "gmail");
  }

  // 3) build RFC822 message (simple text/plain; you can extend to HTML multipart later)
  const from = acct.email_address;
  const date = new Date().toUTCString();
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: Re: ${subject?.replace(/^Re:\s*/i, "")}`,
    `In-Reply-To: ${inReplyToMessageId}`,
    `References: ${inReplyToMessageId}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
  ].join("\r\n");

  const raw = base64UrlEncode(`${headers}\r\n\r\n${body}`);

  // 4) send
  const sendRes = await fetch(GMAIL_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, threadId }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    return NextResponse.json({ error: `Gmail send failed: ${err}` }, { status: 500 });
  }

  const sentJson = await sendRes.json();

  // 5) log + touch emails_sent
  await supabase.from("email_logs").insert({
    user_id: user.id,
    to_email: to,
    subject: subject,
    thread_id: threadId,
    message_id: sentJson.id,
    status: "sent",
    sent_at: new Date().toISOString(),
  });

  await supabase
    .from("emails_sent")
    .update({ last_reply_at: new Date().toISOString(), last_reply_snippet: body?.slice(0, 280), updated_at: new Date().toISOString() })
    .eq("thread_id", threadId);

  return NextResponse.json({ ok: true, id: sentJson.id });
}

