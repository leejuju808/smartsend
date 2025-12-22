import nodemailer from "nodemailer";

export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  ics?: { filename: string; content: string }; // text/calendar
};

export async function sendEmail(params: SendEmailParams) {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM_NAME,
    SMTP_FROM_EMAIL,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM_EMAIL) {
    throw new Error("SMTP env not configured (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL)");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE || "false") === "true",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  const from = SMTP_FROM_NAME
    ? `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`
    : SMTP_FROM_EMAIL;

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

  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}