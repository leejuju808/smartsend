import { NextResponse } from "next/server";
import OpenAI from "openai";
import nodemailer from "nodemailer";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { replyText, recipientEmail, senderEmail } = await req.json();

    // 1️⃣ Detect reply intent using GPT
    const intentPrompt = `
    Classify this email reply as one of: "positive", "neutral", "negative".
    Reply only with one word.
    Email: ${replyText}
    `;
    const intentRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: intentPrompt }],
    });

    const intent = intentRes.choices[0].message?.content?.trim().toLowerCase();

    // 2️⃣ If positive intent, send meeting invite
    if (intent === "positive") {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.SMTP_USER!,
          pass: process.env.SMTP_PASS!,
        },
      });

      const icsContent = `
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Intro Meeting with SmartSend
DTSTART:${new Date(Date.now() + 86400000).toISOString().replace(/[-:]/g, "").split(".")[0]}Z
DTEND:${new Date(Date.now() + 90000000).toISOString().replace(/[-:]/g, "").split(".")[0]}Z
DESCRIPTION:Automated meeting scheduled via SmartSend AI.
LOCATION:Google Meet or Calendly
END:VEVENT
END:VCALENDAR
      `;

      const mailOptions = {
        from: senderEmail,
        to: recipientEmail,
        subject: "Let's book a quick chat 📅",
        text: `Hey! Great to hear from you — here's my calendar link:\n\nhttps://calendly.com/YOUR_CALENDLY_HANDLE\n\nYou can also find a calendar invite attached.`,
        attachments: [
          {
            filename: "meeting.ics",
            content: icsContent,
          },
        ],
      };

      await transporter.sendMail(mailOptions);
    }

    return NextResponse.json({ intent });
  } catch (error) {
    console.error("Reply intent error:", error);
    return NextResponse.json({ error: "Failed to detect intent" }, { status: 500 });
  }
}
