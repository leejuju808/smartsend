import { getGmailAccessToken } from "@/lib/google-tokens";

export async function gmailSend(userId: string, args: {
  to: string; 
  subject: string; 
  html: string; 
  threadId?: string | null; 
  inReplyTo?: string | null; 
  references?: string | null;
}) {
  const access = await getGmailAccessToken(userId);

  // RFC822 message
  const headers = [
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    args.inReplyTo ? `In-Reply-To: ${args.inReplyTo}` : "",
    args.references ? `References: ${args.references}` : "",
  ].filter(Boolean).join("\r\n") + `\r\n\r\n${args.html}`;

  const raw = Buffer.from(headers).toString("base64url");

  const send = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, threadId: args.threadId ?? undefined })
  }).then(r=>r.json());

  if (!send.id) {
    throw new Error(`Gmail send failed: ${JSON.stringify(send)}`);
  }

  return { provider: "gmail" as const, providerMessageId: send.id, providerThreadId: send.threadId };
}

