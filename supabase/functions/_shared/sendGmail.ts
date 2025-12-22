// Block 9900 - Gmail sender using smartsend_sending_accounts
// deno-lint-ignore-file no-explicit-any

import { google } from "https://esm.sh/googleapis@126";

export async function sendGmail(
  account: any,
  params: { to: string; subject: string; htmlBody: string }
) {
  const clientId = Deno.env.get("GMAIL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET")!;
  const redirectUri = Deno.env.get("GMAIL_REDIRECT_URI")!;

  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  // Refresh token flow - refresh if needed
  if (account.expires_at && new Date(account.expires_at) <= new Date()) {
    // Token expired, refresh it
    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refresh_token!,
        grant_type: "refresh_token",
      }),
    });

    if (!refreshResponse.ok) {
      throw new Error(`Failed to refresh token: ${await refreshResponse.text()}`);
    }

    const refreshData = await refreshResponse.json();
    account.access_token = refreshData.access_token;
    account.expires_at = new Date(Date.now() + (refreshData.expires_in * 1000)).toISOString();
  }

  oAuth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  const raw = buildRawMessage({
    from: account.from_name
      ? `"${account.from_name}" <${account.from_email}>`
      : account.from_email,
    to: params.to,
    subject: params.subject,
    html: params.htmlBody,
  });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
    },
  });
}

function buildRawMessage({
  from,
  to,
  subject,
  html,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ];
  const message = messageParts.join("\r\n");
  return btoa(message).replace(/\+/g, "-").replace(/\//g, "_");
}


































































