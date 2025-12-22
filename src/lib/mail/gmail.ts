import { SendArgs } from "./types";

export async function gmailSend(acct: {
  email: string; access_token: string;
}, args: SendArgs) {
  // RFC822 raw email
  const rfc =
`To: ${args.to}
Subject: ${args.subject}
Content-Type: text/plain; charset="UTF-8"

${args.body}`;
  const raw = Buffer.from(rfc).toString("base64").replace(/\+/g,"-").replace(/\//g,"_");
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(acct.email)}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${acct.access_token}`, "Content-Type":"application/json" },
    body: JSON.stringify({ raw })
  });
  if (!resp.ok) throw new Error(`gmail send failed: ${await resp.text()}`);
  return await resp.json();
}

