import nodemailer from "nodemailer";
import { makeIcs } from "@/lib/ics";

export async function sendWithIcs({
  to,
  subject,
  html,
  startISO,
  durationMin = Number(process.env.NEXT_PUBLIC_ICS_DEFAULT_DURATION_MIN || 15),
}: {
  to: string; subject: string; html: string; startISO: string; durationMin?: number;
}) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });

  const ics = makeIcs({
    start: new Date(startISO),
    durationMin,
    title: subject,
    organizerName: process.env.ICS_ORG_NAME || "SmartSend",
    organizerEmail: process.env.ICS_ORG_EMAIL || "no-reply@yoursite.com",
    attendeeEmail: to,
  });

  await transporter.sendMail({
    from: `"${process.env.ICS_ORG_NAME || "SmartSend"}" <${process.env.ICS_ORG_EMAIL || "no-reply@yoursite.com"}>`,
    to,
    subject,
    html,
    icalEvent: {
      filename: "meeting.ics",
      method: "REQUEST",
      content: ics,
    },
  });
}

