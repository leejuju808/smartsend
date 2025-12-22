import { google } from "googleapis";

export async function getGmailClient(tokens: {
  access_token: string;
  refresh_token: string;
  token_expiry?: string | null;
}) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );

  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.token_expiry ? new Date(tokens.token_expiry).getTime() : undefined,
  });

  // Auto-refresh token if needed
  if (tokens.token_expiry && new Date(tokens.token_expiry).getTime() < Date.now() + 60000) {
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
      // Note: Caller should update tokens in DB
    } catch (e) {
      console.error("Token refresh failed:", e);
    }
  }

  return google.gmail({ version: "v1", auth: oauth2 });
}

export function toBase64Url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function buildMime({
  from,
  to,
  subject,
  text,
}: {
  from: string;
  to: string;
  subject?: string;
  text: string;
}): string {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject ?? ""}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ].join("\r\n");
}

export async function refreshTokenIfNeeded(
  account: { access_token: string; refresh_token: string; token_expiry?: string | null; id: string },
  supabase: any
): Promise<string> {
  const stillValid =
    account.access_token &&
    account.token_expiry &&
    new Date(account.token_expiry).getTime() > Date.now() + 60000;

  if (stillValid) {
    return account.access_token;
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );

  oauth2.setCredentials({
    refresh_token: account.refresh_token,
  });

  const { credentials } = await oauth2.refreshAccessToken();
  
  const newExpiry = credentials.expiry_date
    ? new Date(credentials.expiry_date).toISOString()
    : null;

  await supabase
    .from("connected_accounts")
    .update({
      access_token: credentials.access_token,
      token_expiry: newExpiry,
    })
    .eq("id", account.id);

  return credentials.access_token!;
}
