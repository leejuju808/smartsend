import nodemailer from "nodemailer";
import { google } from "googleapis";
import { supabaseAdmin } from "@/server/supabase";

export type SendArgs = {
  owner: string;
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
};

export async function getMailbox(owner: string) {
  const { data, error } = await supabaseAdmin
    .from("mailboxes")
    .select("*")
    .eq("owner", owner)
    .single();
  if (error || !data) throw new Error("No mailbox configured");
  return data as any;
}

async function buildTransportGmail(mb: any) {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URL!
  );
  oAuth2Client.setCredentials({ refresh_token: mb.gmail_refresh_token });

  // Refresh access token on demand
  const { credentials } = await oAuth2Client.getAccessToken();
  const accessToken = credentials.access_token!;
  // Persist latest access token/expiry (best-effort)
  await supabaseAdmin
    .from("mailboxes")
    .update({
      gmail_access_token: accessToken,
      gmail_token_expiry: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : null,
    })
    .eq("owner", mb.owner)
    .catch(() => {});

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: mb.from_email,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      refreshToken: mb.gmail_refresh_token,
      accessToken,
    },
  });
}

async function buildTransportSMTP(mb: any) {
  return nodemailer.createTransport({
    host: mb.smtp_host,
    port: Number(mb.smtp_port || 587),
    secure: !!mb.smtp_secure,
    auth: { user: mb.smtp_user, pass: mb.smtp_pass },
  });
}

export async function sendEmail({ owner, to, subject, html, headers }: SendArgs) {
  const mb = await getMailbox(owner);
  const transport =
    mb.provider === "gmail"
      ? await buildTransportGmail(mb)
      : await buildTransportSMTP(mb);

  const fromName = mb.from_name ? `"${mb.from_name}" ` : "";
  const info = await transport.sendMail({
    from: `${fromName}<${mb.from_email}>`,
    to,
    subject,
    html,
    headers,
  });

  return info;
}

