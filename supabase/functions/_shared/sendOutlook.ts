// Block 9900 - Outlook sender using smartsend_sending_accounts
// deno-lint-ignore-file no-explicit-any

export async function sendOutlook(
  account: any,
  params: { to: string; subject: string; htmlBody: string }
) {
  // Refresh token if needed
  if (account.expires_at && new Date(account.expires_at) <= new Date()) {
    const clientId = Deno.env.get("OUTLOOK_CLIENT_ID")!;
    const clientSecret = Deno.env.get("OUTLOOK_CLIENT_SECRET")!;
    const tenantId = Deno.env.get("OUTLOOK_TENANT_ID") || "common";

    const refreshResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: account.refresh_token!,
          grant_type: "refresh_token",
          scope: "https://graph.microsoft.com/Mail.Send",
        }),
      }
    );

    if (!refreshResponse.ok) {
      throw new Error(`Failed to refresh Outlook token: ${await refreshResponse.text()}`);
    }

    const refreshData = await refreshResponse.json();
    account.access_token = refreshData.access_token;
    account.expires_at = new Date(Date.now() + (refreshData.expires_in * 1000)).toISOString();
  }

  const body = {
    message: {
      subject: params.subject,
      body: { contentType: "HTML", content: params.htmlBody },
      toRecipients: [{ emailAddress: { address: params.to } }],
    },
    saveToSentItems: true,
  };

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      authorization: `Bearer ${account.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Outlook send error: ${res.status} ${errorText}`);
  }
}


































































