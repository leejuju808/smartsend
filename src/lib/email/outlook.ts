import type { EmailProvider, SendArgs } from "./providers";

export default class OutlookProvider implements EmailProvider {
  async send(args: SendArgs) {
    const { to, subject, text = "", html = "", fromEmail, fromName = "" } = args;
    const payload = {
      message: {
        subject,
        body: { contentType: html ? "HTML" : "Text", content: html || text },
        toRecipients: [{ emailAddress: { address: to } }],
        from: { emailAddress: { address: fromEmail, name: fromName || undefined } },
      },
      saveToSentItems: true,
    } as const;
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: txt || "outlook send failed" };
    }
    return { ok: true, messageId: undefined };
  }
}


