import { SendArgs } from "./types";

export async function outlookSend(acct: {
  access_token: string;
}, args: SendArgs) {
  const payload = {
    message: {
      subject: args.subject,
      body: { contentType: "Text", content: args.body },
      toRecipients: [{ emailAddress: { address: args.to } }]
    },
    saveToSentItems: true
  };
  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${acct.access_token}`, "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error(`outlook send failed: ${await resp.text()}`);
  return { ok: true };
}

