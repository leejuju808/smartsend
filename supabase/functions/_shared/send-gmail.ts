import { ensureGmailAccess } from "./refreshers.ts";

function base64url(input: string) {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendViaGmail(args: {
  conn: any;
  fromEmail?: string | null;
  to: string;
  subject: string;
  html: string;
  messageId?: string | null;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const c = await ensureGmailAccess(args.conn);

  const headers: string[] = [
    `From: ${args.fromEmail || c.email}`,
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    ...(args.messageId ? [`Message-ID: ${args.messageId}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=\"UTF-8\"",
  ];
  if (args.inReplyTo) headers.push(`In-Reply-To: ${args.inReplyTo}`);
  if (args.references) {
    headers.push(`References: ${args.references}`);
  } else if (args.messageId) {
    headers.push(`References: ${args.messageId}`);
  }

  const rfc822 = `${headers.join("\r\n")}\r\n\r\n${args.html}`;
  const raw = base64url(rfc822);

  const url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
  const body: Record<string, unknown> = { raw };
  if (args.threadId) body.threadId = args.threadId;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false as const, error: `gmail send failed: ${t}` };
  }

  const j = await res.json();
  return {
    ok: true as const,
    provider: "gmail" as const,
    providerMessageId: j.id as string,
    providerThreadId: j.threadId as string,
  };
}











