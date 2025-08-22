import nodemailer from "nodemailer";

export function getTransport() {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export async function sendHtmlEmail({
  to, subject, html, fromName, fromEmail,
}: { to: string; subject: string; html: string; fromName?: string; fromEmail?: string; }) {
  const transport = getTransport();
  const from = `"${fromName || process.env.SMTP_FROM_NAME || "SmartSend"}" <${fromEmail || process.env.SMTP_FROM_EMAIL}>`;
  return transport.sendMail({ from, to, subject, html });
}

