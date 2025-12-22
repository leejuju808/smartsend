function base64UrlEncode(str: string) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function gmailSendRaw(accessToken: string, rawRfc822: string) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64UrlEncode(rawRfc822) }),
  });
  if (!res.ok) throw new Error(`gmail send failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export function buildRfc822Html({ from, to, subject, html }: { from: string; to: string; subject: string; html: string }) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ].join("\r\n");
}


