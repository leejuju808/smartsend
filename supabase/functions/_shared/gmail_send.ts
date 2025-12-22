// supabase/functions/_shared/gmail_send.ts
// deno-lint-ignore-file no-explicit-any
import { ensureGoogleAccessToken } from "./google_oauth.ts";

function base64Url(str: string) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function gmailSendHtml(params: {
  sb: any;
  accountId: string;
  fromEmail: string; // the connected account email
  toEmail: string;
  subject: string;
  html: string;
  threadId?: string; // Gmail threadId (optional)
}): Promise<{ providerMessageId: string; providerThreadId?: string }> {
  const { sb, accountId, fromEmail, toEmail, subject, html, threadId } = params;
  const token = await ensureGoogleAccessToken(sb, accountId);

  // Minimal RFC 5322 with UTF-8 headers
  const boundary = "mixed_" + crypto.randomUUID().slice(0, 8);
  const raw =
`From: ${fromEmail}
To: ${toEmail}
Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset="UTF-8"

${html}

--${boundary}--`;

  const body = { raw: base64Url(raw), ...(threadId ? { threadId } : {}) };

  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (resp.status === 429 || resp.status === 403) {
    // Let caller decide backoff; include response text.
    throw new Error(`rate/quota: ${await resp.text()}`);
  }
  if (resp.status === 401) {
    throw new Error(`auth: ${await resp.text()}`);
  }
  if (!resp.ok) {
    throw new Error(`gmail send error: ${resp.status} ${await resp.text()}`);
  }
  const j = await resp.json();
  return { providerMessageId: j.id as string, providerThreadId: j.threadId as string | undefined };
}



