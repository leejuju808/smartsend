import { NextRequest, NextResponse } from "next/server";
import { buildICS } from "@/lib/meetings/ics";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title = process.env.MEETING_DEFAULT_TITLE || "Meeting",
      description = "",
      startISO,                 // client sends ISO in local; we convert to UTC
      durationMin = Number(process.env.MEETING_DEFAULT_DURATION_MIN || 30),
      organizerEmail,           // required
      organizerName = process.env.NEXT_PUBLIC_SITE_NAME || "SmartSend",
      location = process.env.NEXT_PUBLIC_CALENDLY_URL || "Video conference",
    } = body || {};

    if (!organizerEmail) {
      return NextResponse.json({ error: "organizerEmail required" }, { status: 400 });
    }
    if (!startISO) {
      return NextResponse.json({ error: "startISO required" }, { status: 400 });
    }

    const start = new Date(startISO); // assume client sent local ISO; Date stores UTC internally
    const ics = buildICS({
      title,
      description,
      start,
      durationMin,
      organizerEmail,
      organizerName,
      location,
    });

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="meeting.ics"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}

