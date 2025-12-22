export async function sendEmail({
  leadId,
  campaignId,
  fromEmail,
  toEmail,
  subject,
  text,
  inReplyTo,
  references,
}: {
  leadId: string;
  campaignId?: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
}) {
  const r = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId, campaignId, fromEmail, toEmail, subject, text, inReplyTo, references }),
  });
  if (!r.ok) throw new Error((await r.json()).error || "Send failed");
  return r.json() as Promise<{ ok: boolean; messageId: string; threadId: string | null; providerSendId: string | null }>;
}

