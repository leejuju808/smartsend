import { NextRequest, NextResponse } from "next/server";
import { buildICS } from "@/lib/meetings/ics";
import { sendEmail } from "@/lib/mail/simple-send";

/**
 * POST /api/replies/send-meeting
 * Body:
 * {
 *   to: string,
 *   subject: string,
 *   body: string,            // plaintext body that includes Calendly link
 *   startISO: string,        // meeting start (ISO)
 *   endISO: string,          // meeting end (ISO)
 *   organizerName?: string,
 *   organizerEmail?: string,
 *   attendeeName?: string,
 *   calendlyUrl?: string     // optional; also embedded in ICS URL
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const {
      to,
      subject,
      body,
      startISO,
      endISO,
      organizerName = process.env.SMTP_FROM_NAME || "SmartSend",
      organizerEmail = process.env.SMTP_FROM_EMAIL,
      attendeeName = (to || "").split("@")[0],
      calendlyUrl,
    } = await req.json();

    if (!to || !subject || !body || !startISO || !endISO) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!organizerEmail) {
      return NextResponse.json({ error: "SMTP_FROM_EMAIL must be set in env" }, { status: 500 });
    }

    const startDate = new Date(startISO);
    const endDate = new Date(endISO);
    const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
    
    const ics = buildICS({
      title: "Intro call",
      description: "Quick intro & SmartSend fit check",
      location: calendlyUrl || "Google Meet / Zoom",
      organizerEmail,
      organizerName,
      start: startDate,
      durationMin,
    });

    const result = await sendEmail({
      to,
      subject,
      text: body,
      ics: { filename: "intro-call.ics", content: ics },
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to send meeting reply" }, { status: 500 });
  }
}