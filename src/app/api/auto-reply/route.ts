import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Nodemailer transport using SMTP provider (e.g., Gmail, Mailgun, SES SMTP)
function buildTransport() {
  if (!process.env.SMTP_HOST) {
    throw new Error("Missing SMTP_HOST");
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT || 587),
    secure: !!(process.env.SMTP_SECURE === "true"), // true for 465, false for other ports
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER!,
          pass: process.env.SMTP_PASS!,
        }
      : undefined,
  });
}

/**
 * POST /api/auto-reply
 * Body: { messageId: string }
 *
 * Behavior:
 * - Finds a pending meeting for this message (intent='interested', status='pending').
 * - Sends an email reply with Calendly link + ICS attachment to sender_email.
 * - Updates meetings.status -> 'emailed'.
 */
export async function POST(req: Request) {
  try {
    const { messageId } = await req.json();
    if (!messageId) {
      return NextResponse.json({ success: false, error: "messageId required" }, { status: 400 });
    }

    // 1) Load meeting and related data
    const { data: meeting, error: meetingErr } = await supabaseAdmin
      .from("meetings")
      .select("*")
      .eq("message_id", messageId)
      .eq("intent", "interested")
      .eq("status", "pending")
      .single();

    if (meetingErr || !meeting) {
      return NextResponse.json(
        { success: false, error: "No pending interested meeting found for messageId." },
        { status: 404 }
      );
    }

    const toEmail = meeting.sender_email;
    const calendlyLink =
      meeting.calendly_link || process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/yourname/meeting";
    const icsContent = meeting.ics_file as string;

    // 2) Build and send email
    const transporter = buildTransport();
    const fromEmail = process.env.FROM_EMAIL || "no-reply@smartsend.ai";

    const mail = await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: "Let's lock time — calendar attached",
      text: [
        `Hey there,`,
        ``,
        `Thanks for the reply — here's a quick link to book a time: ${calendlyLink}`,
        `I've also attached an .ics calendar invite if you prefer to add it directly.`,
        ``,
        `Talk soon!`,
      ].join("\n"),
      html: [
        `<p>Hey there,</p>`,
        `<p>Thanks for the reply — here's a quick link to book a time:</p>`,
        `<p><a href="${calendlyLink}" target="_blank" rel="noreferrer">${calendlyLink}</a></p>`,
        `<p>I've also attached an .ics calendar invite if you prefer to add it directly.</p>`,
        `<p>Talk soon!</p>`,
      ].join(""),
      attachments: [
        {
          filename: "meeting.ics",
          content: icsContent,
          contentType: "text/calendar; charset=UTF-8; method=REQUEST",
        },
      ],
    });

    // 3) Update meeting status
    const { error: updateErr } = await supabaseAdmin
      .from("meetings")
      .update({ status: "emailed", sent_message_id: mail.messageId || null })
      .eq("id", meeting.id);

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Auto-reply sent with Calendly link and ICS.",
      toEmail,
      calendlyLink,
      transportMessageId: mail.messageId || null,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
