// lib/providers/smtp.ts
import nodemailer from "nodemailer";

export type SendPayload = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  from?: string; // optional override
};

export type SMTPSettings = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
  oauth?: {
    type: "OAuth2";
    user: string;               // Gmail address
    clientId: string;
    clientSecret: string;
    refreshToken?: string;
    accessToken?: string;       // optional if you fetch at runtime
  };
  dkim?: { domainName: string; keySelector: string; privateKey: string };
};

export type ProviderSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function providerSendSMTP(settings: SMTPSettings, payload: SendPayload): Promise<ProviderSendResult> {
  try {
    const auth = settings.oauth
      ? {
          type: "OAuth2" as const,
          user: settings.oauth.user,
          clientId: settings.oauth.clientId,
          clientSecret: settings.oauth.clientSecret,
          refreshToken: settings.oauth.refreshToken,
          accessToken: settings.oauth.accessToken,
        }
      : (settings.user && settings.pass)
      ? { user: settings.user, pass: settings.pass }
      : undefined;

    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth,
      dkim: settings.dkim, // optional
    } as any);

    const from = payload.from || settings.from || settings.user;
    if (!from) return { ok: false, error: "missing_from" };

    const res = await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      headers: payload.headers,
    });

    // Nodemailer returns messageId; use that as provider_message_id
    const messageId = (res && (res as any).messageId) ? String((res as any).messageId) : "";
    if (!messageId) return { ok: false, error: "no_message_id" };
    return { ok: true, messageId };
  } catch (e: any) {
    return { ok: false, error: `smtp_exception:${e?.message ?? String(e)}` };
  }
}
