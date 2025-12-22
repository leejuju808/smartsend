import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { generateIcs } from "@/lib/ics";
import crypto from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  const secret = process.env.MEETING_ICS_SIGNING_SECRET || "dev-secret";
  const expected = crypto.createHmac("sha256", secret).update(params.id).digest("hex");
  if (token !== expected) {
    return NextResponse.json({ error: "Bad token" }, { status: 403 });
  }

  const sb = getSupabaseServer();
  const { data: meeting, error } = await sb
    .from("meetings")
    .select("*, profiles(email)")
    .eq("id", params.id)
    .single();

  if (error || !meeting) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  const start = meeting.scheduled_at ? new Date(meeting.scheduled_at) : new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const ics = generateIcs({
    summary: meeting.title ?? "Intro call",
    description: meeting.notes ?? undefined,
    start,
    end,
    url: meeting.calendly_event_uri ?? process.env.NEXT_PUBLIC_CALENDLY_PUBLIC_LINK,
    organizerEmail: process.env.NEXT_PUBLIC_OUTBOUND_FROM_EMAIL,
    attendeeEmail: undefined, // intentionally blank here
    location: meeting.location ?? "Calendly",
    uid: meeting.id,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="meeting-${meeting.id}.ics"`,
    },
  });
} 