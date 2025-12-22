"use server";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select(
      "id,campaign_id,lead_id,subject,has_meeting_intent,proposed_meeting,booked_meeting_at",
    )
    .eq("id", params.threadId)
    .maybeSingle();

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 500 });
  }

  if (!thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  const { data: intent } = await supabase
    .from("meeting_intents")
    .select("lead_tz,my_tz,duration_min,window_start,window_end,note,detected_at")
    .eq("thread_id", thread.id)
    .order("detected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: prefs } = await supabase
    .from("meeting_prefs")
    .select(
      "tz,workdays,start_hour,end_hour,buffer_min,location,booking_link,duration_min,auto_book_links,confirmation_template",
    )
    .eq("campaign_id", thread.campaign_id)
    .maybeSingle();

  const [{ data: lead }, { data: sto }] = await Promise.all([
    supabase.from("leads").select("first_name,last_name,email").eq("id", thread.lead_id).maybeSingle(),
    supabase
      .from("lead_sto_profiles")
      .select("best_hour,tz")
      .eq("campaign_id", thread.campaign_id)
      .eq("lead_id", thread.lead_id)
      .maybeSingle(),
  ]);

  const leadTz = intent?.lead_tz || sto?.tz || "America/New_York";
  const campaignTz = intent?.my_tz || prefs?.tz || "America/Los_Angeles";

  return NextResponse.json({
    ok: true,
    thread: {
      id: thread.id,
      subject: thread.subject,
      has_meeting_intent: thread.has_meeting_intent,
      proposed_meeting: thread.proposed_meeting,
      booked_meeting_at: thread.booked_meeting_at,
    },
    lead: {
      name: `${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`.trim() || null,
      email: lead?.email ?? null,
      sto_best_hour: sto?.best_hour ?? null,
    },
    scheduling: {
      lead_tz: leadTz,
      campaign_tz: campaignTz,
      duration_min: intent?.duration_min ?? prefs?.duration_min ?? 30,
      workdays: prefs?.workdays ?? [1, 2, 3, 4, 5],
      start_hour: prefs?.start_hour ?? 9,
      end_hour: prefs?.end_hour ?? 17,
      buffer_min: prefs?.buffer_min ?? 15,
      location: prefs?.location ?? "Google Meet",
      booking_link: prefs?.booking_link ?? null,
      auto_book_links: prefs?.auto_book_links ?? true,
      confirmation_template: prefs?.confirmation_template ?? null,
      window_start: intent?.window_start ?? null,
      window_end: intent?.window_end ?? null,
      note: intent?.note ?? null,
    },
  });
}

