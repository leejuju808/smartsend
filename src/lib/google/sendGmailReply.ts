import { Buffer } from "buffer";

type Args = {
  to: string;
  from: string;
  subject: string;
  threadId: string;
  bodyText: string;
};

function base64Url(str: string) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmailReply(accessToken: string, args: Args) {
  const raw = [
    `To: ${args.to}`,
    `From: ${args.from}`,
    `Subject: ${args.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    args.bodyText,
  ].join("\r\n");

  const payload = { raw: base64Url(raw), threadId: args.threadId };

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed: ${err}`);
  }

  return res.json();
}

