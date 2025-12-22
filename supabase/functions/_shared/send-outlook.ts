import { ensureOutlookAccess } from "./refreshers.ts";

export async function sendViaOutlook(args: {
  conn: any;
  fromEmail?: string | null;
  to: string;
  subject: string;
  html: string;
  replyToId?: string | null;
}) {
  const c = await ensureOutlookAccess(args.conn);

  const sendRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: args.subject,
        body: { contentType: "HTML", content: args.html },
        toRecipients: [{ emailAddress: { address: args.to } }],
        ...(args.replyToId ? { internetMessageId: args.replyToId } : {}),
      },
      saveToSentItems: true,
    }),
  });

  if (!sendRes.ok) {
    const t = await sendRes.text();
    return { ok: false as const, error: `outlook send failed: ${t}` };
  }

  const sent = await fetch(
    "https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages?$top=1&$orderby=receivedDateTime desc",
    {
      headers: { Authorization: `Bearer ${c.access_token}` },
    }
  );

  if (!sent.ok) {
    const t = await sent.text();
    return {
      ok: true as const,
      provider: "outlook" as const,
      providerMessageId: undefined,
      providerThreadId: undefined,
      warn: `sent lookup failed: ${t}`,
    };
  }

  const js = await sent.json();
  const m = js.value?.[0];

  return {
    ok: true as const,
    provider: "outlook" as const,
    providerMessageId: m?.id as string | undefined,
    providerThreadId: m?.conversationId as string | undefined,
  };
}











