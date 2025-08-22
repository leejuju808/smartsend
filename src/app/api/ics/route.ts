import { NextRequest, NextResponse } from "next/server";
import { makeIcs } from "@/lib/ics";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      startISO,
      durationMin = Number(process.env.NEXT_PUBLIC_ICS_DEFAULT_DURATION_MIN || 15),
      title = "Intro call",
      description = "Quick intro call from SmartSend",
      attendeeEmail,
    } = body || {};

    if (!startISO) {
      return NextResponse.json({ error: "startISO required" }, { status: 400 });
    }

    const start = new Date(startISO);
    const ics = makeIcs({
      start,
      durationMin,
      title,
      description,
      organizerName: process.env.ICS_ORG_NAME || "SmartSend",
      organizerEmail: process.env.ICS_ORG_EMAIL || "no-reply@yoursite.com",
      attendeeEmail,
    });

    const mode = (body?.mode as "download" | "base64") || "base64";
    if (mode === "download") {
      return new NextResponse(ics, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="meeting.ics"`,
        },
      });
    }

    const base64 = Buffer.from(ics, "utf-8").toString("base64");
    return NextResponse.json({ base64, filename: "meeting.ics", mime: "text/calendar" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "ICS generation failed" }, { status: 500 });
  }
}

