import { google } from "googleapis";
import { supabaseAdmin } from "./supabaseAdmin";

export function getGoogleOAuth() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI!
  );
  return client;
}

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly", // optional for future
];

export async function upsertAccount(params: {
  workspaceId: string;
  provider: "gmail";
  email: string;
  access_token: string;
  refresh_token: string;
  scope?: string;
  expiry_date?: number; // ms epoch
}) {
  const token_expiry = params.expiry_date ? new Date(params.expiry_date).toISOString() : null;
  const { error } = await supabaseAdmin.from("connected_accounts").upsert({
    workspace_id: params.workspaceId,
    provider: params.provider,
    account_email: params.email,
    access_token: params.access_token,
    refresh_token: params.refresh_token,
    scope: params.scope ?? GMAIL_SCOPES.join(" "),
    token_expiry,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,provider,account_email" });
  if (error) throw error;
}

export async function getWorkspaceGmail(workspaceId: string) {
  const { data, error } = await supabaseAdmin
    .from("connected_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("provider", "gmail")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function refreshIfNeeded(row: any) {
  const now = Date.now();
  const expiry = row?.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  if (expiry && now < expiry - 60_000) return row; // still valid

  const oauth2 = getGoogleOAuth();
  oauth2.setCredentials({ refresh_token: row.refresh_token, access_token: row.access_token });
  const res = await oauth2.refreshAccessToken();
  const creds = res.credentials;
  const { error } = await supabaseAdmin.from("connected_accounts").update({
    access_token: creds.access_token!,
    token_expiry: creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (error) throw error;
  return { ...row, access_token: creds.access_token, token_expiry: creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null };
}

export function buildRFC822({ from, to, subject, text, html }:{
  from: string; to: string; subject: string; text?: string; html?: string;
}) {
  const boundary = "mixed_" + Math.random().toString(36).slice(2);
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    text || "",
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    html || (text ? `<pre>${text}</pre>` : ""),
    "",
    `--${boundary}--`,
    ""
  ];
  return lines.join("\r\n");
}

export function base64url(str: string) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function gmailSend({
  accessToken,
  from,
  to,
  subject,
  text,
  html,
}: {
  accessToken: string;
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) {
  const gmail = google.gmail({ version: "v1" });
  // userId 'me' works when the token is for that account
  const raw = base64url(buildRFC822({ from, to, subject, text, html }));
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
    headers: { Authorization: `Bearer ${accessToken}` } as any,
  } as any);
  return res.data.id || "";
}
