// SmartSend — Provider Adapters
// Unified interface for Gmail and Outlook sending

import { refreshAccessToken } from "@/lib/providers/google/oauth";
import { createClient } from "@supabase/supabase-js";

export interface SendResult {
  messageId: string;
  threadId?: string;
}

export interface Provider {
  send(to: string, subject: string, body: string): Promise<SendResult>;
}

function buildRawRFC822({ from, to, subject, html }: { from: string; to: string; subject: string; html: string; }) {
  const boundary = "mixed_" + Math.random().toString(36).slice(2);
  const head = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    `--${boundary}--`
  ].join("\r\n");
  return Buffer.from(head).toString("base64url");
}

export class GmailProvider implements Provider {
  private accessToken: string;
  private refreshToken: string;
  private emailAddress: string;
  private clientId: string;
  private clientSecret: string;

  constructor(accessToken: string, refreshToken: string, emailAddress: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.emailAddress = emailAddress;
    this.clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
    this.clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  }

  async send(to: string, subject: string, body: string): Promise<SendResult> {
    // Refresh token if needed
    let accessToken = this.accessToken;
    
    // Check if token needs refresh (simplified - in production check expires_at)
    try {
      const refreshed = await refreshAccessToken({
        refreshToken: this.refreshToken,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      });
      accessToken = refreshed.access_token;
      this.accessToken = accessToken; // Update for next use
    } catch (e) {
      // If refresh fails, try with existing token
    }

    const raw = buildRawRFC822({
      from: this.emailAddress,
      to,
      subject,
      html: body,
    });

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gmail send failed: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    
    // Extract message ID and thread ID from Gmail response
    return {
      messageId: data.id || data.messageId || "",
      threadId: data.threadId || undefined,
    };
  }
}

export class OutlookProvider implements Provider {
  private accessToken: string;
  private refreshToken: string;
  private emailAddress: string;
  private clientId: string;
  private clientSecret: string;

  constructor(accessToken: string, refreshToken: string, emailAddress: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.emailAddress = emailAddress;
    this.clientId = process.env.OUTLOOK_CLIENT_ID || "";
    this.clientSecret = process.env.OUTLOOK_CLIENT_SECRET || "";
  }

  async send(to: string, subject: string, body: string): Promise<SendResult> {
    // Refresh Microsoft token if needed
    let accessToken = this.accessToken;
    
    // TODO: Implement Microsoft token refresh
    // For now, use existing token (in production, check expires_at and refresh)

    // Build MIME message for Microsoft Graph
    const message = {
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${this.emailAddress}/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Outlook send failed: ${res.status} - ${errorText}`);
    }

    // Microsoft Graph doesn't return message ID in sendMail response
    // We need to fetch it separately or construct it
    // For now, return a placeholder - in production, you'd fetch the sent message
    return {
      messageId: `outlook-${Date.now()}`,
      threadId: undefined, // Outlook threading handled differently
    };
  }
}

// Factory function to create provider from sending_profile
export async function createProviderFromProfile(
  supabase: ReturnType<typeof createClient>,
  profileId: string
): Promise<Provider> {
  const { data: profile, error } = await supabase
    .from("sending_profiles")
    .select("*")
    .eq("id", profileId)
    .single();

  if (error || !profile) {
    throw new Error(`Sending profile not found: ${profileId}`);
  }

  // Refresh token if needed based on token_expires_at
  let accessToken = (profile.oauth_access_token || "") as string;
  const tokenExpiresAt = profile.token_expires_at as string | null | undefined;
  
  if (tokenExpiresAt && new Date(tokenExpiresAt).getTime() - Date.now() < 60_000) {
    if (profile.provider === "gmail") {
      try {
        const refreshed = await refreshAccessToken({
          refreshToken: (profile.oauth_refresh_token || "") as string,
          clientId: process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "",
          clientSecret: process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
        });
        if (refreshed && refreshed.access_token) {
          accessToken = refreshed.access_token;
          
          // Update profile with new token
          await supabase
            .from("sending_profiles")
            .update({
              oauth_access_token: accessToken,
              token_expires_at: refreshed.expires_in 
                ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
                : tokenExpiresAt,
            })
            .eq("id", profileId);
        }
      } catch (error) {
        console.error("Token refresh failed, using existing token:", error);
      }
    } else if (profile.provider === "outlook") {
      // TODO: Implement Outlook token refresh
      throw new Error("Outlook token refresh not implemented");
    }
  }

  if (profile.provider === "gmail") {
    return new GmailProvider(
      accessToken,
      (profile.oauth_refresh_token || "") as string,
      (profile.email_address || "") as string
    );
  } else if (profile.provider === "outlook") {
    return new OutlookProvider(
      accessToken,
      (profile.oauth_refresh_token || "") as string,
      (profile.email_address || "") as string
    );
  }

  throw new Error(`Unsupported provider: ${profile.provider}`);
}

// Provider router — pick Resend or SMTP per account
// This is used by the sender-tick function and API routes
import { providerSendResend } from "@/lib/providers/resend";
import { providerSendSMTP, SMTPSettings } from "@/lib/providers/smtp";

type SendPayload = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  from?: string;
};

export async function providerSend(
  account: { provider: string; smtp_settings?: any },
  payload: SendPayload
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const p = (account.provider || "resend").toLowerCase();

  if (p === "smtp" || p === "gmail" || p === "outlook") {
    const settings: SMTPSettings = account.smtp_settings || {};
    
    // For Gmail/Outlook via SMTP, use their standard SMTP servers if not specified
    if (p === "gmail" && !settings.host) {
      settings.host = "smtp.gmail.com";
      settings.port = settings.port || 587;
      settings.secure = settings.secure ?? false;
    } else if (p === "outlook" && !settings.host) {
      settings.host = "smtp-mail.outlook.com";
      settings.port = settings.port || 587;
      settings.secure = settings.secure ?? false;
    }
    
    return providerSendSMTP(settings, payload);
  }

  // default to Resend
  const r = await providerSendResend({
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    headers: payload.headers,
    from: payload.from,
  });
  
  return r.ok ? { ok: true, messageId: r.messageId } : { ok: false, error: r.error };
}

