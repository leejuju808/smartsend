import { google } from "googleapis";
import { supabaseAdmin } from "@/server/supabase";
import { refreshAccessToken } from "./oauth";

/**
 * Get an authenticated Gmail client for a user
 */
export async function getGmailClient(userId: string) {
  // Get user's Gmail connection
  const { data: conn, error } = await supabaseAdmin
    .from("user_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (error || !conn) {
    throw new Error("Gmail not connected");
  }

  if (!conn.refresh_token) {
    throw new Error("Invalid Gmail connection: missing refresh_token");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

  // Build OAuth2 client
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GOOGLE_OAUTH_REDIRECT_URL || process.env.GOOGLE_REDIRECT_URI
  );

  // Set credentials
  oauth2.setCredentials({
    access_token: conn.access_token || undefined,
    refresh_token: conn.refresh_token,
    expiry_date: conn.expires_at ? new Date(conn.expires_at).getTime() : undefined,
  });

  // Ensure token is fresh
  const now = Date.now();
  const expiryTime = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  
  if (!conn.access_token || now >= expiryTime - 300000) { // Refresh 5min before expiry
    try {
      const tokens = await refreshAccessToken({
        refreshToken: conn.refresh_token,
        clientId,
        clientSecret,
      });

      // Store refreshed token
      await supabaseAdmin
        .from("user_connections")
        .update({
          access_token: tokens.access_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);

      // Update local client
      oauth2.setCredentials({
        access_token: tokens.access_token,
        refresh_token: conn.refresh_token,
        expiry_date: Date.now() + tokens.expires_in * 1000,
      });
    } catch (e) {
      console.error("Failed to refresh Gmail token:", e);
      throw new Error("Gmail token refresh failed");
    }
  }

  return google.gmail({ version: "v1", auth: oauth2 });
}

/**
 * Send email via Gmail API using raw RFC822 message
 */
export async function sendViaGmail(params: {
  userId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  html: string;
}) {
  const gmail = await getGmailClient(params.userId);

  // Build RFC822 message
  const boundary = "----=_Part_" + Math.random().toString(36).slice(2);
  const raw = `From: ${params.fromEmail}
To: ${params.toEmail}
Subject: ${params.subject}
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="${boundary}"

--${boundary}
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

${params.subject.replace(/./g, "")}

--${boundary}
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

${params.html}

--${boundary}--`;

  // Base64URL encode
  const b64 = Buffer.from(raw).toString("base64");
  const b64url = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: b64url },
    });

    return {
      messageId: response.data.id || null,
      threadId: response.data.threadId || null,
    };
  } catch (error: any) {
    console.error("Gmail send error:", error);
    throw new Error(`Gmail send failed: ${error.message}`);
  }
}
