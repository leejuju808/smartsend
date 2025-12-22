import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("meeting_intents")
    .select(
      "thread_id,campaign_id,lead_id,detected_at,source_message_id,lead_tz,my_tz,duration_min,window_start,window_end,note",
    )
    .eq("thread_id", params.threadId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let bookingLink: string | null = null;

  if (data?.campaign_id) {
    const { data: prefs, error: prefsError } = await supabase
      .from("meeting_prefs")
      .select("booking_link")
      .eq("campaign_id", data.campaign_id)
      .maybeSingle();

    if (prefsError) {
      return NextResponse.json({ error: prefsError.message }, { status: 500 });
    }

    bookingLink = prefs?.booking_link ?? null;
  }

  return NextResponse.json({ meeting_intent: data ?? null, booking_link: bookingLink });
}



