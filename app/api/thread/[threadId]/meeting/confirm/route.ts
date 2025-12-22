import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { buildICS, googleLink, outlookLink } from "@/lib/calendar";

const Body = z.object({
  slot_id: z.string().uuid(),
  title: z.string().min(1).default("Intro call"),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const slotId = parse.data.slot_id;
  const { data: slot, error: slotError } = await supabase
    .from("meeting_slots")
    .select("*")
    .eq("id", slotId)
    .maybeSingle();
  if (slotError) {
    return NextResponse.json({ error: slotError.message }, { status: 500 });
  }
  if (!slot) {
    return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  }
  if (slot.thread_id !== params.threadId) {
    return NextResponse.json({ error: "slot_mismatch" }, { status: 403 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id,lead_id,subject")
    .eq("id", params.threadId)
    .maybeSingle();

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 500 });
  }

  if (!thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }
  if (!thread.lead_id) {
    return NextResponse.json({ error: "thread_missing_lead" }, { status: 400 });
  }

  const [{ data: lead }, { data: pref }, { data: intent }] = await Promise.all([
    thread.lead_id
      ? supabase
          .from("leads")
          .select("first_name,last_name,email")
          .eq("id", thread.lead_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    thread.campaign_id
      ? supabase
          .from("meeting_prefs")
          .select("*")
          .eq("campaign_id", thread.campaign_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("meeting_intents")
      .select("lead_tz")
      .eq("thread_id", thread.id)
      .maybeSingle(),
  ]);

  const start = new Date(slot.start_utc);
  const end = new Date(slot.end_utc);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const repId = user?.id as string | undefined;
  const title = parse.data.title;
  const location = parse.data.location ?? pref?.location ?? "Google Meet";
  const leadName = `${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`.trim();

  if (!lead?.email) {
    return NextResponse.json({ error: "lead_missing_email" }, { status: 400 });
  }

  if (repId) {
    const { data: repChk } = await supabase
      .rpc("is_user_busy", {
        p_user: repId,
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      })
      .maybeSingle();

    if (repChk?.busy) {
      return NextResponse.json(
        { error: "rep_busy_conflict", conflicts: repChk.conflicts },
        { status: 409 },
      );
    }
  }

  const ics = buildICS({
    uid: crypto.randomUUID(),
    title,
    description: parse.data.notes || "Looking forward to speaking.",
    start,
    end,
    organizer: { name: "SmartSend", email: "noreply@smartsend" },
    attendee: { name: leadName.length ? leadName : undefined, email: lead?.email ?? "" },
    location,
  });

  const g = googleLink({ title, start, end, details: parse.data.notes, location });
  const o = outlookLink({ title, start, end, body: parse.data.notes, location });
  const leadTzValue = intent?.lead_tz ?? pref?.tz ?? "America/New_York";
  const pretty = (d: Date) =>
    d.toLocaleString(undefined, {
      timeZone: leadTzValue,
      dateStyle: "medium",
      timeStyle: "short",
    });

  const bodyLines = [
    `Hi ${lead?.first_name || ""},`,
    "",
    `Locked a time: **${pretty(start)} – ${pretty(end)}**`,
    location ? `Location: ${location}` : "",
    leadTzValue ? `Timezone: ${leadTzValue}` : "",
    "",
    "Prefer adding via calendar?",
    `• Google: ${g}`,
    `• Outlook: ${o}`,
    "",
    "If you need another time, just let me know.",
    "",
    "— SmartSend",
  ];
  const body = bodyLines
    .filter((line, idx) => line !== "" || (idx > 0 && bodyLines[idx - 1] !== ""))
    .join("\n");

  const { data: insertedDraft, error: insertError } = await supabase
    .from("send_queue")
    .insert({
    campaign_id: thread.campaign_id,
    lead_id: thread.lead_id,
    thread_id: thread.id,
    step_id: null,
    variant_id: null,
    subject: `Re: ${thread.subject || title}`,
    body,
    headers: { to: lead?.email ?? "" },
    status: "draft",
    source: "meeting_confirm",
    })
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase
    .from("inbox_threads")
    .update({
      proposed_meeting: false,
      booked_meeting_at: start.toISOString(),
      needs_reply: false,
    })
    .eq("id", thread.id);

  if (repId) {
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    await supabase.from("rep_calendar_blocks").insert({
      user_id: repId,
      source: "smartsend",
      title: "Lead meeting",
      time: `[${startIso},${endIso})`,
    });
  }

  return NextResponse.json({
    ok: true,
    gcal: g,
    outlook: o,
    ics,
    queue_id: insertedDraft?.id ?? null,
  });
}


