import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";
import { generateIcs } from "@/lib/ics";

export async function POST(req: Request) {
  try {
    const { messageId, recipientEmail, senderEmail, intent } = await req.json();

    if (intent !== "positive") {
      return NextResponse.json({ skipped: true, reason: "Not positive intent" });
    }

    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1️⃣ Fetch sender's meeting link from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("calendly_url, full_name")
      .eq("id", user.id)
      .single();

    if (!profile?.calendly_url) {
      return NextResponse.json({ error: "Missing meeting link" }, { status: 400 });
    }

    // 2️⃣ Create ICS calendar invite
    const meetingStart = new Date();
    meetingStart.setDate(meetingStart.getDate() + 1);
    meetingStart.setHours(10, 0, 0, 0); // Set to 10:00 AM
    
    const meetingEnd = new Date(meetingStart);
    meetingEnd.setMinutes(meetingEnd.getMinutes() + 30); // 30 minute meeting

    const icsContent = generateIcs({
      summary: `Meeting with ${profile.full_name || 'SmartSend User'}`,
      description: `Scheduled via SmartSend AI\n\nBook your preferred time: ${profile.calendly_url}`,
      start: meetingStart,
      end: meetingEnd,
      organizerEmail: senderEmail,
      attendeeEmail: recipientEmail,
      location: "Video conference (link in calendar)",
      url: profile.calendly_url
    });

    // 3️⃣ Send follow-up email with link + invite
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: senderEmail,
      to: recipientEmail,
      subject: `Let's schedule a quick call ⚡`,
      text: `Hey — great to hear back from you! You can grab a quick slot here: ${profile.calendly_url}`,
      attachments: [
        {
          filename: "meeting.ics",
          content: icsContent,
          contentType: "text/calendar",
        },
      ],
    });

    // 4️⃣ Log meeting in Supabase
    await supabase.from("meetings").insert({
      user_id: user.id,
      message_id: messageId,
      contact_email: recipientEmail,
      start_at: meetingStart,
      end_at: meetingEnd,
      status: "proposed",
      calendly_link: profile.calendly_url,
      ics: icsContent,
      subject: `Meeting with ${profile.full_name || 'SmartSend User'}`,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Auto-insert meeting error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}