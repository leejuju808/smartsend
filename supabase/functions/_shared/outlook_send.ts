// deno-lint-ignore-file no-explicit-any

import { msEnsureAccessToken, msGetConn } from "./ms_oauth.ts";

export async function outlookSendHtml(params: {
  sb: any;
  accountId: string;
  toEmail: string;
  subject: string;
  html: string;
  conversationId?: string;
}): Promise<{ providerMessageId: string; conversationId?: string }> {
  const { sb, accountId, toEmail, subject, html } = params;
  const token = await msEnsureAccessToken(sb, accountId);
  const conn = await msGetConn(sb, accountId);

  const body = {
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: toEmail } }],
    },
    saveToSentItems: true,
  };

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 || res.status === 403)
    throw new Error(`rate/quota: ${await res.text()}`);
  if (res.status === 401) throw new Error(`auth: ${await res.text()}`);
  if (!res.ok)
    throw new Error(`outlook send error: ${res.status} ${await res.text()}`);

  const resList = await fetch(
    "https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages?$top=1&$select=id,conversationId,subject,receivedDateTime",
    {
      headers: { authorization: `Bearer ${token}` },
    }
  );
  if (!resList.ok)
    throw new Error(
      `outlook sent fetch error: ${resList.status} ${await resList.text()}`
    );
  const j = await resList.json();
  const msg = j.value?.[0];
  return {
    providerMessageId: msg?.id,
    conversationId: msg?.conversationId,
  };
}




