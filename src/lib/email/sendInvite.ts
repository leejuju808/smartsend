import nodemailer from "nodemailer";

interface SendInviteEmailParams {
  to: string;
  subject: string;
  html: string;
  icsContent: string;
}

interface SendInviteEmailResult {
  messageId: string | null;
  id?: string;
}

export async function sendInviteEmail({
  to,
  subject,
  html,
  icsContent,
}: SendInviteEmailParams): Promise<SendInviteEmailResult> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    attachments: [
      {
        filename: "meeting.ics",
        content: Buffer.from(icsContent),
        contentType: "text/calendar; method=REQUEST",
      },
    ],
  });

  return {
    messageId: info.messageId || null,
    id: info.messageId,
  };
}
