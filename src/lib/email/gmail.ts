import type { EmailProvider, SendArgs } from "./providers";
import { buildMultipartAlternative } from "../mime";

export default class GmailProvider implements EmailProvider {
  async send(args: SendArgs) {
    const { to, subject, text = "", html = "", fromEmail, fromName = "", attachments } = args;

    const raw = buildMultipartAlternative({
      from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      to,
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, " ") : ""),
      html: html || `<pre>${text}</pre>`,
      attachments,
    });

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }
    );
    const json = await res.json();
    if (!res.ok)
      return { ok: false, error: json.error?.message || "gmail send failed" };
    return { ok: true, messageId: json.id };
  }
}


