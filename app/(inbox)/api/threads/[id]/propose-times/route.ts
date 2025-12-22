import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatSlotsHuman, nextSlots } from "@/lib/availability";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const threadId = params.id;

  const { anchorISO } = await req.json().catch(() => ({}));

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, campaign_id")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) {
    return NextResponse.json({ ok: false, error: threadError.message }, { status: 500 });
  }
  if (!thread) {
    return NextResponse.json({ ok: false, error: "Thread not found" }, { status: 404 });
  }

  const { data: prefs, error: prefsError } = await supabase
    .from("v_campaign_prefs")
    .select("duration_min, tz, workdays, start_hour, end_hour, buffer_min")
    .eq("campaign_id", thread.campaign_id)
    .maybeSingle();
  if (prefsError) {
    return NextResponse.json({ ok: false, error: prefsError.message }, { status: 500 });
  }

  const tz = prefs?.tz || "America/Los_Angeles";
  const startFromISO = typeof anchorISO === "string" && anchorISO.length > 0 ? anchorISO : new Date().toISOString();

  const workdays =
    Array.isArray(prefs?.workdays) && prefs.workdays.length > 0 ? (prefs.workdays as number[]) : [1, 2, 3, 4, 5];

  const slots = nextSlots({
    tz,
    startFromISO,
    workdays,
    startHour: prefs?.start_hour ?? 9,
    endHour: prefs?.end_hour ?? 17,
    durationMin: prefs?.duration_min ?? 30,
    bufferMin: prefs?.buffer_min ?? 15,
    count: 3,
  });

  const human = formatSlotsHuman(slots, tz);

  return NextResponse.json({ ok: true, tz, slots, human });
}

