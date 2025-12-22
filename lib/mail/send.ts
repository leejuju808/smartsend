import nodemailer from "nodemailer";

export type SMTPAccount = {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  secret: string;
  from_name?: string | null;
  from_email: string;
  rate_limit_per_minute: number;
};

export type SendEmailParams = {
  account: SMTPAccount;
  to: string;
  subject: string;
  text: string;
  ics?: { filename: string; content: string }; // text/calendar
};

export async function sendEmail(params: SendEmailParams) {
  const a = params.account;

  const transporter = nodemailer.createTransport({
    host: a.host,
    port: a.port,
    secure: a.secure,
    auth: { user: a.username, pass: a.secret },
  });

  const from = a.from_name ? `"${a.from_name}" <${a.from_email}>` : a.from_email;

  const attachments = params.ics
    ? [{ filename: params.ics.filename, content: params.ics.content, contentType: "text/calendar; charset=utf-8" }]
    : [];

  const info = await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    attachments,
  });

  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response };
}