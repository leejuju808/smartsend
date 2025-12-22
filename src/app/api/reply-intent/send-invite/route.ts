import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { createClient } from "@supabase/supabase-js";
import { buildICS } from "@/lib/ics";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const {
      meeting_id,
      message_id,
      to_email,
      to_name,
      // Optional overrides:
      title = "SmartSend Intro Call",
      description = "Automated meeting invite from SmartSend AI.",
      duration_minutes = 30,
      start_iso, // e.g., "2025-10-11T10:00:00-07:00"
      calendly_url = process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/your_calendly_link",
      location = process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/your_calendly_link",
      organizer_name = process.env.FROM_NAME || "SmartSend AI",
      organizer_email = process.env.FROM_EMAIL || "no-reply@smartsend.ai",
    } = await req.json();

    if (!to_email) {
      return NextResponse.json({ error: "Missing to_email" }, { status: 400 });
    }

    // 1) Create ICS (fallback start time = now + 1 hour if not provided)
    const startDate = start_iso ? new Date(start_iso) : new Date(Date.now() + 60 * 60 * 1000);
    const endDate = new Date(startDate.getTime() + duration_minutes * 60 * 1000);

    const icsContent = buildICS({
      uid: `meeting-${meeting_id || Date.now()}-${to_email}@smartsend.ai`,
      title,
      description: `${description}\n\nQuick link: ${calendly_url}`,
      start: startDate,
      end: endDate,
      organizerEmail: organizer_email,
      organizerName: organizer_name,
      attendeeEmail: to_email,
      location,
    });

    // 2) Send email via our mailer utility
    const html = `
      <p>Hi${to_name ? " " + to_name : ""},</p>
      <p>Great to connect! I've proposed a ${duration_minutes}-minute intro call.</p>
      <p><strong>Quick book link:</strong> <a href="${calendly_url}">${calendly_url}</a></p>
      <p>I've also attached a calendar invite. If that time doesn't work, feel free to pick a slot via the link above.</p>
      <p>– ${organizer_name}</p>
    `;

    const mailResult = await sendMail({
      from: `${organizer_name} <${organizer_email}>`,
      to: to_email,
      subject: `Invitation: ${title}`,
      text: `Great to connect! Book here: ${calendly_url}`,
      html,
      attachments: [
        {
          filename: "invite.ics",
          content: icsContent,
          contentType: "text/calendar; method=REQUEST",
        },
      ],
    });

    // 3) Persist outbound message log
    await supabase.from("outbound_messages").insert({
      meeting_id: meeting_id || null,
      message_id: message_id || null,
      to_email,
      subject: `Invitation: ${title}`,
      calendly_url,
      sent_provider_id: mailResult.messageId || null,
      ics_blob: icsContent,
      sent_at: new Date().toISOString(),
    });

    // 4) Mark meeting as "invite_sent"
    if (meeting_id) {
      await supabase
        .from("meetings")
        .update({ invite_sent_at: new Date().toISOString() })
        .eq("id", meeting_id);
    }

    return NextResponse.json({ status: "sent", message_id: mailResult.messageId });
  } catch (err: any) {
    console.error("send-invite error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
