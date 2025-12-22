// deno-lint-ignore-file no-explicit-any
import { getMailbox, ensureGmailAccess, ensureGraphAccess } from "../_shared/token.ts";

type Payload = {
  mailboxId: string;            // which connected mailbox to send from
  threadId?: string | null;     // provider thread/conversation id
  to: string[];                  // recipients
  subject: string;
  bodyText: string;              // simple text reply (safe for demo)
  messageIdRef?: string | null;  // provider message id to reply to (optional)
};

function base64url(input: string) {
  // btoa works with UTF-8 strings in Deno
  const base64 = btoa(input);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function gmailSend(mb: any, p: Payload) {
  const access = await ensureGmailAccess(mb);
  // Build RFC822
  const headers = [
    `From: ${mb.email}`,
    `To: ${p.to.join(", ")}`,
    `Subject: ${p.subject}`,
    `In-Reply-To: ${p.messageIdRef || ""}`,
    `References: ${p.messageIdRef || ""}`,
    `Content-Type: text/plain; charset=UTF-8`,
  ].filter(Boolean).join("\r\n");

  const raw = `${headers}\r\n\r\n${p.bodyText}`;
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Authorization": `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64url(raw), threadId: p.threadId || undefined })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function outlookSend(mb: any, p: Payload) {
  const access = await ensureGraphAccess(mb);
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { "Authorization": `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: p.subject,
        body: { contentType: "Text", content: p.bodyText },
        toRecipients: p.to.map(e => ({ emailAddress: { address: e }})),
        conversationId: p.threadId || undefined
      },
      saveToSentItems: true
    })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.text();
}

Deno.serve(async (req) => {
  try {
    const p = await req.json() as Payload;
    const mb = await getMailbox(p.mailboxId);
    if (mb.provider === "gmail") {
      const out = await gmailSend(mb, p);
      return new Response(JSON.stringify({ ok: true, provider: "gmail", out }), { headers: { "Content-Type": "application/json" }});
    }
    if (mb.provider === "outlook") {
      const out = await outlookSend(mb, p);
      return new Response(JSON.stringify({ ok: true, provider: "outlook", out }), { headers: { "Content-Type": "application/json" }});
    }
    return new Response(JSON.stringify({ error: "Unsupported provider" }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

