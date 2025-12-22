import { NextRequest, NextResponse } from "next/server";
import { buildICS } from "@/lib/calendar/ics";

/**
 * POST /api/meetings/invite
 * Body:
 * {
 *   title: string,
 *   description?: string,
 *   location?: string,
 *   organizer?: { name?: string, email: string },
 *   attendee?: { name?: string, email: string } | { name?: string, email: string }[],
 *   startISO: string,  // ISO8601
 *   endISO: string,    // ISO8601
 *   filename?: string  // default "invite.ics"
 * }
 *
 * Returns an .ics file as attachment.
 */
export async function POST(req: NextRequest) {
  try {
    const {
      title,
      description,
      location,
      organizer,
      attendee,
      startISO,
      endISO,
      filename = "invite.ics",
      url
    } = await req.json();

    if (!title || !startISO || !endISO) {
      return NextResponse.json({ error: "title, startISO, endISO are required" }, { status: 400 });
    }

    const ics = buildICS({
      title,
      description,
      location,
      organizer,
      attendee,
      start: new Date(startISO),
      end: new Date(endISO),
      url
    });

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to build ICS" }, { status: 500 });
  }
}