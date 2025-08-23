import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { buildSimpleICS } from "@/lib/ics";
import { wantsMeeting } from "@/lib/meeting-intent";

const resend = new Resend(process.env.RESEND_API_KEY!);

/**
 * Expected JSON body:
 * {
 *   "to": "prospect@company.com",
 *   "subject": "Re: ...",
 *   "body": "plain text body (we'll enhance if meeting intent)",
 *   "from": process.env.RESEND_FROM (server will set if omitted)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, from } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Missing to/subject/body" }, { status: 400 });
    }

    let text = body as string;
    const attachments: Array<{ filename: string; content: string; contentType: string }> = [];

    // Auto-insert Calendly + ICS if intent detected
    if (wantsMeeting(text)) {
      const start = new Date(Date.now() + 48 * 3600 * 1000); // 2 days out
      const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 mins

      const calendly = process.env.NEXT_PUBLIC_CALENDLY_URL;
      if (calendly) {
        text += `\n\nBook a time here: ${calendly}`;
      }

      const ics = buildSimpleICS({
        title: "Intro Call – SmartSendAI",
        description: "Looking forward to chatting!",
        url: calendly || "",
        start,
        end,
        organizer: "mailto:" + (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@yourdomain.com"),
      });

      attachments.push({
        filename: "SmartSendAI-Intro-Call.ics",
        content: ics,
        contentType: "text/calendar; method=PUBLISH",
      });

      // Small nudge line so it's obvious to the recipient
      text += `\n\nI've attached a calendar invite for a 30-min intro.`;
    }

    const fromAddr = from || process.env.RESEND_FROM!;
    const send = await resend.emails.send({
      from: fromAddr,
      to,
      subject,
      text,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    if (send.error) {
      return NextResponse.json({ error: send.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: send.data?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to send" }, { status: 500 });
  }
} 